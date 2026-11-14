import {
  CaretLeft,
  CaretRight,
  Cards,
  CornersIn,
  CornersOut,
  Flag,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Palette,
  Pause,
  Play,
  ShareNetwork,
  SpeakerHigh,
  SpeakerSlash,
  StarFour,
  SunDim,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Backdrop } from "./components/Backdrop";
import { CollectingStrip } from "./components/CollectingStrip";
import { GoTo } from "./components/GoTo";
import { Lens } from "./components/Lens";
import { LongTimeline } from "./components/LongTimeline";
import { LogoMark, Wordmark } from "./components/Logo";
import { Reading, type ReadingPlace } from "./components/Reading";
import { ShareCard } from "./components/ShareCard";
import { SkyMap, type Handoff, type SkyMapHandle, type SkyMarker } from "./components/SkyMap";
import { SlewReadout, type Slew } from "./components/SlewReadout";
import { SpectrumStrip } from "./components/SpectrumStrip";
import { Timeline } from "./components/Timeline";
import { BLENDED, CUSTOM_NOTE, KIND_LABEL, SEARCH_LABEL, searchNote, TARGET_NOTES } from "./content";
import {
  assetUrl,
  defaultBand,
  findFrame,
  finding,
  loadIndex,
  loadManifest,
  loadPreview,
  loadSpectrum,
  referenceMotion,
  shiftAt,
  trail,
  type Manifest,
  type TargetRef,
} from "./lib/bundle";
import { loadAtlas, type Atlas } from "./lib/allsky";
import type { CardInput } from "./lib/card";
import { coord, coordShort, microns, monthYear, shiftWords, span } from "./lib/format";
import { prefersReducedMotion } from "./lib/hooks";
import { preload, useImageStore } from "./lib/images";
import { backdropPalette, isPalette, lookGradient, LOOKS, LUTS, REVEAL_LUT, type PaletteId } from "./lib/palette";
import { isPending, requestSky, SkyRequestError, skyStatus, type SkyJob } from "./lib/sky";
import { separationDeg, slewMs, useSkyGeometry, useZoomTween } from "./lib/skygeo";
import { WISE_SOFTEN_ARCSEC, wiseTone } from "./lib/tone";
import type { Spectrum } from "./lib/spectrum";
import { motionNote, sonifier } from "./sound/sonify";

const BLINK_MS = 700;
// Deretan 16 tahun punya belasan citra, jadi diputar lebih cepat.
const LONG_MS = 420;
// Di deretan 16 tahun, kunjungan SPHEREx ditahan lebih lama dari citra WISE, dan
// paling lama tepat di serah-terima antar teleskop supaya larutnya sempat selesai.
const LONG_VISIT_MS = 900;
const HANDOVER_MS = 1600;
// Lebar langit yang tampil di lensa saat hanya SPHEREx: gerak sekitar satu piksel perlu didekati.
const CLOSE_ARCSEC = 120;
// Jeda antara lensa terbuka dan menyelam ke pembesaran kerja, supaya terlihat dua tahap.
const DIVE_MS = 620;
// Contoh biasanya siap dalam sekejap; lensa menunggu sebentar supaya bisa terbang masuk.
const LAND_WAIT_MS = 900;
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
const LINK_VIEW = LINK.get("view");
const LINK_TARGET = LINK.get("target");
// Tanpa tautan ke satu tempat, situs dibuka di seluruh langit.
const LINK_OPENS_PLACE = !!(LINK_TARGET || LINK_NAME || LINK_HAS_POSITION);
const LINK_SKY_BAND = /^D[1-6]$/.test(LINK.get("band") ?? "") ? LINK.get("band")! : "D5";
// Tujuan tombol "Show me a moving star": gerak diri tercepat di langit kita.
const TOUR_ID = "barnard";
const KIND_DETAIL = { moving: "moves", variable: "changes brightness", custom: "yours" } as const;
// Lebar pandangan lebar kalau bundelnya belum diketahui, detik busur.
const WIDE_ARCSEC = 2400;
const LINK_LOOK = LINK.get("look");
const GUIDE_KEY = "swara.guide";

type Era = "long" | "spherex";

export function App() {
  const [targets, setTargets] = useState<TargetRef[]>();
  const [indexError, setIndexError] = useState(false);
  const [targetId, setTargetId] = useState<string>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [spec, setSpec] = useState<{ id: string; data?: Spectrum; error?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [bandId, setBandId] = useState<string>();
  const [windowId, setWindowId] = useState<string>();
  // Rentang waktu yang diputar: 16 tahun (WISE lalu SPHEREx) atau hanya kunjungan SPHEREx.
  const [era, setEra] = useState<Era>("spherex");
  // Citra WISE yang sedang tampil; kosong berarti lensa menampilkan kunjungan SPHEREx.
  const [wiseId, setWiseId] = useState<string>();
  const [zoomArcsec, setZoomArcsec] = useState(CLOSE_ARCSEC);
  // Pandangan lebar: lensa tertutup dan latar tampil sebagai langit itu sendiri.
  const [sky, setSky] = useState(false);
  // Teleskop sedang berpindah ke tempat lain.
  const [slew, setSlew] = useState<Slew>();
  // Tempat yang lensanya sudah terbuka; sebelum itu lensa masih tertutup di langit lebar.
  const [landedId, setLandedId] = useState<string>();
  // Pembesaran kerja yang dituju setelah lensa terbuka pada medan terlebarnya.
  // Tempat yang sedang tampil dari pratinjau (bundle-nya masih dibuat).
  const previewFor = useRef<string | undefined>(undefined);
  const homeZoom = useRef<number | undefined>(undefined);
  const diveTimer = useRef(0);
  const appRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const zoomerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>(isPalette(LINK_LOOK) ? LINK_LOOK : "heat");
  // Roda filter: pilihan look di cincin lensa.
  const [wheelOpen, setWheelOpen] = useState(false);
  // Mengangkat yang redup di lensa dan latar.
  const [reveal, setReveal] = useState(false);
  // Penanda kecil di tombol Guide sampai pernah dibuka sekali.
  const [guideSeen, setGuideSeen] = useState(() => {
    try {
      return window.localStorage.getItem(GUIDE_KEY) === "1";
    } catch {
      return true;
    }
  });
  const [showFlags, setShowFlags] = useState(false);
  const [motionSound, setMotionSound] = useState(false);
  // Koordinat bebas yang dibuka di sesi ini, per id; keadaannya dilaporkan API.
  const [jobs, setJobs] = useState<Record<string, SkyJob>>({});
  const [query, setQuery] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [gotoOpen, setGotoOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Mode fokus: bilah atas dan dok menghilang, tinggal benda dan keterangannya.
  const [focus, setFocus] = useState(false);
  const [copied, setCopied] = useState(false);
  // Dialog kartu berbagi.
  const [cardOpen, setCardOpen] = useState(false);
  // Seluruh langit: tingkat terluar teleskop, di atas panggung tempat yang terakhir dibuka.
  const [atlas, setAtlas] = useState(!LINK_OPENS_PLACE);
  // Gerak antara seluruh langit dan satu tempat: menjauh dari tempat itu, atau menyelam ke sana.
  const [atlasFx, setAtlasFx] = useState<{ kind: "enter"; ra: number; dec: number } | { kind: "leave" }>();
  const skyRef = useRef<SkyMapHandle>(null);
  const [atlasData, setAtlasData] = useState<Atlas>();
  const [atlasFailed, setAtlasFailed] = useState(false);
  const [skyBand, setSkyBand] = useState(LINK_SKY_BAND);
  const [skyLines, setSkyLines] = useState(true);
  const atlasTimer = useRef(0);
  // Tempat yang dibuka dari seluruh langit: datangnya lewat menyelam, bukan berpindah.
  const quietArrival = useRef<string | undefined>(undefined);
  // Band yang sedang terdengar saat suara spektrum berjalan; lensa ikut menampilkannya.
  const [heardBand, setHeardBand] = useState<string>();
  const soundRing = useRef<SVGCircleElement>(null);
  const images = useImageStore();

  const toggleFocus = useCallback(() => {
    setFocus((on) => {
      // Layar penuh sungguhan kalau browser mengizinkan; tanpa itu mode fokus tetap jalan.
      if (!on) void document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
      return !on;
    });
  }, []);
  // Keluar dari layar penuh lewat Esc milik browser juga mengakhiri mode fokus.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const openGuide = useCallback(() => {
    setNotesOpen(true);
    setGuideSeen(true);
    try {
      window.localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // penyimpanan diblokir: penandanya hanya muncul lagi lain kali
    }
  }, []);

  const bandFromLink = useRef(LINK.get("band"));
  const viewFromLink = useRef(LINK_VIEW);

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

  /** Buka satu nama benda atau koordinat. Mengembalikan job-nya, atau pesan kalau
   *  ditolak atau gagal. `quiet`: datang dari seluruh langit, tanpa gerak berpindah. */
  const openSky = useCallback(async (text: string, quiet = false): Promise<SkyJob | string> => {
    setFormBusy(true);
    setFormError(undefined);
    try {
      const next = await requestSky(text);
      setJobs((all) => ({ ...all, [next.id]: next }));
      if (quiet) quietArrival.current = next.id;
      setTargetId(next.id);
      return next;
    } catch (err) {
      const message =
        err instanceof SkyRequestError
          ? err.message
          : "The search service is not reachable right now. The examples still work.";
      if (!(err instanceof SkyRequestError)) console.error(err);
      setFormError(message);
      return message;
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
      const byName = LINK_NAME ? typeof (await openSky(LINK_NAME)) !== "string" : false;
      const opened = byName || (LINK_HAS_POSITION && typeof (await openSky(`${LINK_RA} ${LINK_DEC}`)) !== "string");
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
        const linked = LINK_NAME || LINK_HAS_POSITION ? undefined : list.find((t) => t.id === LINK_TARGET);
        if (linked) setTargetId((cur) => cur ?? linked.id);
        // Tautan ke tempat yang tidak dikenal dibuka di seluruh langit.
        else if (LINK_TARGET && !LINK_NAME && !LINK_HAS_POSITION) setAtlas(true);
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
    // Pratinjau yang sedang tampil dibiarkan sampai bundle lengkapnya datang.
    setLoaded((cur) => (cur?.id === targetId && cur.manifest?.preview ? cur : { id: targetId }));
    loadManifest(targetId, custom, ac.signal)
      .then((manifest) => {
        // Band dari tautan hanya dipakai untuk target pertama yang tampil.
        const wanted = bandFromLink.current;
        bandFromLink.current = null;
        const band = wanted && manifest.frames.some((f) => f.band === wanted) ? wanted : defaultBand(manifest);
        const first = manifest.windows.find((w) => findFrame(manifest, w.id, band));
        const wise = manifest.wise?.frames ?? [];
        preload([
          ...manifest.frames.flatMap((f) => [assetUrl(targetId, custom, f.image), assetUrl(targetId, custom, f.mask)]),
          ...wise.map((f) => assetUrl(targetId, custom, f.image)),
        ]);
        // Kalau ada riwayat WISE, cerita dimulai dari sana, kecuali tautan meminta SPHEREx saja.
        if (previewFor.current === targetId) {
          // Orang sudah menonton riwayat WISE tempat ini: bundle lengkap masuk tanpa
          // mengulang dari awal. Kunjungan SPHEREx menyusul di ujung deretan.
          previewFor.current = undefined;
          setLoaded({ id: targetId, manifest });
          setBandId(band);
          setWindowId(first?.id);
          return;
        }
        const wantedView = viewFromLink.current;
        viewFromLink.current = null;
        const long = wise.length > 0 && wantedView !== "spherex";
        setLoaded({ id: targetId, manifest });
        setBandId(band);
        setWindowId(first?.id);
        setEra(long ? "long" : "spherex");
        setWiseId(long ? wise[0].id : undefined);
        // Lensa selalu terbuka pada medan terlebarnya, tempat isinya berimpit dengan
        // latar, lalu menyelam ke pembesaran kerja.
        window.clearTimeout(diveTimer.current);
        homeZoom.current = long ? manifest.fov_arcsec : Math.min(CLOSE_ARCSEC, manifest.fov_arcsec);
        setZoomArcsec(manifest.fov_arcsec);
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

  // Selagi bundle baru dibuat, tampilkan yang sudah siap: riwayat WISE dalam
  // beberapa detik, lalu langit lebar. Sisanya menyusul saat bundle lengkap.
  const previewParts = job && pending ? `${job.wise ? "w" : ""}${job.context ? "c" : ""}` : "";
  useEffect(() => {
    if (!targetId || !previewParts) return;
    const ac = new AbortController();
    loadPreview(targetId, ac.signal)
      .then((preview) => {
        setLoaded((cur) =>
          cur?.id === targetId && cur.manifest && !cur.manifest.preview ? cur : { id: targetId, manifest: preview },
        );
        preload((preview.wise?.frames ?? []).map((f) => assetUrl(targetId, true, f.image)));
        const first = preview.wise?.frames[0];
        if (first && previewFor.current !== targetId) {
          previewFor.current = targetId;
          setEra("long");
          setWiseId(first.id);
          setZoomArcsec(preview.fov_arcsec);
          setPlaying(!prefersReducedMotion());
        }
      })
      .catch(() => undefined); // belum tertulis atau sudah diganti bundle lengkap: coba lagi nanti
    return () => ac.abort();
  }, [targetId, previewParts]);

  // Yang sedang tampil dicatat di URL, supaya tautannya membuka pandangan yang sama.
  useEffect(() => {
    if (atlas) {
      const p = new URLSearchParams();
      if (skyBand !== "D5") p.set("band", skyBand);
      if (palette !== "heat") p.set("look", palette);
      const q = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
      return;
    }
    if (!targetId || !bandId || !manifest) return;
    const p = new URLSearchParams();
    if (job) {
      p.set("ra", job.ra.toFixed(4));
      p.set("dec", job.dec.toFixed(4));
      if (job.label) p.set("name", job.label);
    } else p.set("target", targetId);
    p.set("band", bandId);
    if (manifest.wise?.frames.length && era === "spherex") p.set("view", "spherex");
    if (palette !== "heat") p.set("look", palette);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }, [targetId, bandId, manifest, job, era, palette, atlas, skyBand]);

  // Spektrum menyusul setelah citra; panelnya punya keadaan memuat sendiri.
  useEffect(() => {
    if (!targetId || !manifest || manifest.preview) return;
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
  // Penanda di peta seluruh langit: contoh, lalu tempat yang dibuka di sesi ini.
  const skyMarkers = useMemo<SkyMarker[]>(
    () => [
      ...(targets ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        detail: KIND_DETAIL[t.kind],
        ra: t.ra,
        dec: t.dec,
        yours: false,
        current: t.id === targetId,
        built: true,
      })),
      ...Object.values(jobs)
        .filter((j) => j.status !== "error")
        .map((j) => ({
          id: j.id,
          name: j.label || coordShort(j.ra, j.dec),
          detail: "yours",
          ra: j.ra,
          dec: j.dec,
          yours: true,
          current: j.id === targetId,
          built: j.status === "ready",
        })),
    ],
    [targets, jobs, targetId],
  );

  // Arah pindah dari tempat sebelumnya, untuk gerak latar. Diturunkan saat render
  // supaya tempat baru dan arahnya sampai ke latar pada saat yang sama.
  const [route, setRoute] = useState<{ id?: string; ra: number; dec: number; bearing: { x: number; y: number } }>({
    ra: 0,
    dec: 0,
    bearing: { x: 0, y: 0 },
  });
  if (target && target.id !== route.id) {
    // Dari seluruh langit, teleskop menyelam ke titiknya; tidak ada perpindahan lagi.
    const from = quietArrival.current === target.id ? undefined : route.id;
    setRoute({
      id: target.id,
      ra: target.ra,
      dec: target.dec,
      bearing: from ? bearingBetween(route, target) : { x: 0, y: 0 },
    });
    setSky(false);
    // Lama perpindahan mengikuti jarak sudut yang sebenarnya di langit.
    const degrees = from ? separationDeg(route, target) : 0;
    setSlew(
      from && !prefersReducedMotion()
        ? {
            id: target.id,
            from: { ra: route.ra, dec: route.dec },
            to: { ra: target.ra, dec: target.dec },
            degrees,
            ms: slewMs(degrees),
            startedAt: performance.now(),
          }
        : undefined,
    );
  }
  useEffect(() => {
    if (!slew) return;
    const timer = window.setTimeout(() => setSlew((cur) => (cur === slew ? undefined : cur)), slew.ms);
    return () => window.clearTimeout(timer);
  }, [slew]);
  useEffect(() => {
    if (route.id && quietArrival.current === route.id) quietArrival.current = undefined;
  }, [route.id]);

  // Manifest peta seluruh langit dimuat begitu dibutuhkan: pembuka, atau pratinjau di "Go to".
  useEffect(() => {
    if (atlasData || (!atlas && !gotoOpen && !notesOpen)) return;
    let alive = true;
    loadAtlas()
      .then((data) => alive && setAtlasData(data))
      .catch((err) => {
        console.error(err);
        if (alive) setAtlasFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [atlas, gotoOpen, notesOpen, atlasData]);

  // Menjauh dari pandangan lebar: peta mulai dari tempat ini lalu menjauh sampai seluruh langit.
  const enterAtlas = useCallback(() => {
    window.clearTimeout(atlasTimer.current);
    setPlaying(false);
    setWheelOpen(false);
    setAtlas(true);
    setAtlasFx(target && !prefersReducedMotion() ? { kind: "enter", ra: target.ra, dec: target.dec } : undefined);
    // Kalau petanya tidak pernah selesai tiba (gagal dimuat), keadaan geraknya tetap dilepas.
    atlasTimer.current = window.setTimeout(() => setAtlasFx(undefined), 5000);
  }, [target]);

  // Mendekat ke satu titik: peta menyelam ke sana sampai sejajar dengan pandangan lebarnya.
  const leaveAtlas = useCallback((to: { ra: number; dec: number }) => {
    window.clearTimeout(atlasTimer.current);
    const map = skyRef.current;
    if (!map || prefersReducedMotion()) {
      setAtlas(false);
      setAtlasFx(undefined);
      return;
    }
    setAtlasFx({ kind: "leave" });
    void map.dive(to.ra, to.dec).then(() => {
      setAtlas(false);
      setAtlasFx(undefined);
    });
  }, []);
  useEffect(() => () => window.clearTimeout(atlasTimer.current), []);

  /** Pilih tempat dari seluruh langit (penanda, contoh, atau tombol tur). */
  const pickFromAtlas = useCallback(
    (id: string) => {
      const to = allTargets.find((t) => t.id === id);
      if (!to) return;
      if (id === targetId) setSky(false);
      else {
        quietArrival.current = id;
        selectTarget(id);
      }
      leaveAtlas(to);
    },
    [allTargets, targetId, selectTarget, leaveAtlas],
  );

  /** Kembali dari seluruh langit ke tempat terakhir, di pandangan lebarnya. */
  const backToPlace = useCallback(() => {
    if (!target) return;
    setSky(true);
    leaveAtlas(target);
  }, [target, leaveAtlas]);

  const available = useMemo(
    () => (manifest && bandId ? manifest.windows.filter((w) => findFrame(manifest, w.id, bandId)) : []),
    [manifest, bandId],
  );
  const availableIds = useMemo(() => new Set(available.map((w) => w.id)), [available]);

  const wise = manifest?.wise?.frames.length ? manifest.wise : undefined;
  const long = era === "long" && !!wise;
  // Urutan yang diputar: citra WISE lalu kunjungan SPHEREx, atau kunjungan SPHEREx saja.
  const sequence = useMemo(
    () => [
      ...(long && wise ? wise.frames.map((f) => ({ wise: true, id: f.id })) : []),
      ...available.map((w) => ({ wise: false, id: w.id })),
    ],
    [long, wise, available],
  );
  const shownWise = long ? wise?.frames.find((f) => f.id === wiseId) : undefined;
  const cursor = sequence.findIndex((f) => (shownWise ? f.wise && f.id === shownWise.id : !f.wise && f.id === windowId));

  const show = useCallback((f: { wise: boolean; id: string }) => {
    setSky(false);
    if (f.wise) setWiseId(f.id);
    else {
      setWiseId(undefined);
      setWindowId(f.id);
    }
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (sequence.length < 2) return;
      show(sequence[(Math.max(cursor, 0) + dir + sequence.length) % sequence.length]);
    },
    [sequence, cursor, show],
  );

  // Blink. Tiap citra ditahan selama gilirannya, lalu maju satu.
  useEffect(() => {
    if (!playing || sequence.length < 2) return;
    const at = Math.max(cursor, 0);
    const here = sequence[at];
    const before = sequence[(at - 1 + sequence.length) % sequence.length];
    const after = sequence[(at + 1) % sequence.length];
    const dwell = !long
      ? BLINK_MS
      : here.wise
        ? LONG_MS
        : before.wise || after.wise
          ? HANDOVER_MS
          : LONG_VISIT_MS;
    const timer = window.setTimeout(() => step(1), dwell);
    return () => window.clearTimeout(timer);
  }, [playing, step, sequence, cursor, long]);

  const chooseEra = useCallback(
    (next: Era) => {
      if (!manifest || !wise) return;
      window.clearTimeout(diveTimer.current);
      homeZoom.current = undefined;
      setSky(false);
      setEra(next);
      setWiseId(next === "long" ? wise.frames[0].id : undefined);
      setZoomArcsec(next === "long" ? manifest.fov_arcsec : Math.min(CLOSE_ARCSEC, manifest.fov_arcsec));
    },
    [manifest, wise],
  );

  // Tingkat pembesaran: seluruh medan bundle, lalu makin dekat.
  const zoomLevels = useMemo(
    () => (manifest ? [...new Set([manifest.fov_arcsec, 180, CLOSE_ARCSEC].filter((z) => z <= manifest.fov_arcsec))] : []),
    [manifest],
  );
  const zoomIndex = Math.max(0, zoomLevels.indexOf(zoomArcsec));
  // Di luar tingkat terlebar ada pandangan lebar: lensa menutup dan latar mengambil alih.
  const canSky = !!manifest?.context;
  const zoom = useCallback(
    (dir: 1 | -1) => {
      window.clearTimeout(diveTimer.current);
      homeZoom.current = undefined;
      if (sky) {
        if (dir === 1) setSky(false);
        else enterAtlas();
        return;
      }
      const next = zoomLevels[zoomIndex + dir];
      if (next) setZoomArcsec(next);
      else if (dir === -1 && canSky) {
        setPlaying(false);
        setSky(true);
      } else if (dir === -1) enterAtlas();
    },
    [zoomLevels, zoomIndex, sky, canSky, enterAtlas],
  );

  // Suara mulai memutar satu kunjungan: blink berhenti dan panggung ikut ke kunjungan itu.
  const listen = useCallback(
    (id: string) => {
      setPlaying(false);
      setSky(false);
      if (availableIds.has(id)) {
        setWiseId(undefined);
        setWindowId(id);
      }
    },
    [availableIds],
  );

  const chooseBand = useCallback(
    (id: string) => {
      if (!manifest || !manifest.frames.some((f) => f.band === id)) return;
      setBandId(id);
      setSky(false);
      setWiseId(undefined);
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
      if (atlas) {
        // Di seluruh langit: 1-6 memilih panjang gelombang, + dan - memperbesar peta,
        // panah menggesernya, 0 kembali ke seluruh langit.
        if (/^[1-6]$/.test(e.key)) {
          setSkyBand(`D${e.key}`);
          return;
        }
        const map = skyRef.current;
        if (e.key === "+" || e.key === "=") map?.zoomBy(2);
        else if (e.key === "-") map?.zoomBy(0.5);
        else if (e.key === "0") map?.reset();
        else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          map?.panBy(e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0, e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0);
        }
        if (e.key === " " || e.key.startsWith("Arrow") || /^[+=\-0]$/.test(e.key) || e.key.toLowerCase() === "m") return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setFormError(undefined);
        setGotoOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "g") {
        openGuide();
        return;
      }
      if (e.key.toLowerCase() === "c") {
        setPalette((cur) => LOOKS[(LOOKS.findIndex((l) => l.id === cur) + 1) % LOOKS.length].id);
        return;
      }
      if (e.key.toLowerCase() === "r") {
        setReveal((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === "f" && !atlas) {
        toggleFocus();
        return;
      }
      if (e.key === "Escape") {
        setWheelOpen(false);
        if (focus) toggleFocus();
        return;
      }
      if (e.key === " " && !el.closest("button, a")) {
        e.preventDefault();
        setSky(false);
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key.toLowerCase() === "m" && manifest && referenceMotion(manifest)) {
        setMotionSound((v) => !v);
      } else if (e.key === "+" || e.key === "=") zoom(1);
      else if (e.key === "-") zoom(-1);
      else if (manifest && /^[1-6]$/.test(e.key)) {
        chooseBand(manifest.bands[Number(e.key) - 1]?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, chooseBand, manifest, zoom, openGuide, atlas, focus, toggleFocus]);

  // Saat suara spektrum berjalan, lensa menampilkan band yang sedang terdengar.
  const shownBandId =
    heardBand && manifest && windowId && findFrame(manifest, windowId, heardBand) ? heardBand : bandId;
  const frame = manifest && windowId && shownBandId ? findFrame(manifest, windowId, shownBandId) : undefined;
  const band = manifest?.bands.find((b) => b.id === shownBandId);
  const win = manifest?.windows.find((w) => w.id === windowId);
  const imageUrl = !targetId
    ? undefined
    : shownWise
      ? assetUrl(targetId, custom, shownWise.image)
      : frame && assetUrl(targetId, custom, frame.image);
  const maskUrl = frame && targetId && !shownWise ? assetUrl(targetId, custom, frame.mask) : undefined;
  const image = images.get(imageUrl);

  const jobFailed = job?.status === "error";
  const failed =
    jobFailed || (!custom && indexError) || (loaded?.id === targetId && loaded?.error) || images.hasFailed(imageUrl);
  const status = failed ? "error" : image ? undefined : "loading";

  // Lensa tertutup selama berpindah, sebelum terbang masuk, dan di pandangan lebar.
  const slewing = !!slew && slew.id === targetId;
  const landed = !!targetId && landedId === targetId;
  const collapsed = sky || slewing || !landed;
  const imageReady = !!image && !status;
  useEffect(() => {
    if (!targetId || slewing || landed || atlas) return;
    if (imageReady) {
      // Sejenak dalam keadaan tertutup dulu, supaya terbukanya teranimasi.
      const timer = window.setTimeout(() => setLandedId(targetId), 40);
      return () => window.clearTimeout(timer);
    }
    // Bundle baru yang sedang dibuat langsung menampilkan lensa beserta progresnya.
    const timer = window.setTimeout(() => setLandedId(targetId), pending || failed ? 0 : LAND_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [targetId, slewing, landed, imageReady, pending, failed, atlas]);

  // Setelah terbuka pada medan terlebar, lensa menyelam ke pembesaran kerjanya.
  useEffect(() => {
    const home = homeZoom.current;
    if (!landed || !manifest || home === undefined) return;
    if (home === manifest.fov_arcsec) {
      homeZoom.current = undefined;
      return;
    }
    diveTimer.current = window.setTimeout(
      () => {
        homeZoom.current = undefined;
        setZoomArcsec(home);
      },
      prefersReducedMotion() ? 0 : DIVE_MS,
    );
    return () => window.clearTimeout(diveTimer.current);
  }, [landed, manifest]);

  // Berapa eksposur yang sudah terbaca dari berapa. Jumlah totalnya hanya dilaporkan
  // selama tahap baca; sesudah itu semuanya sudah terbaca.
  const collected = job?.seen_um?.length ?? 0;
  const expected = job?.stage === "fetch" ? Math.max(job.total, collected) : collected;

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
    else if (job.stage === "wise") statusText = "Fetching its WISE history…";
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

  const dateLabel = shownWise ? monthYear(shownWise.mjd_mid) : win ? monthYear(win.mjd_mid) : "";
  const bandLabel = shownWise
    ? `WISE ${wise!.band.lambda_um} µm`
    : band
      ? `${long ? "SPHEREx " : ""}${microns(band.lambda_min, band.lambda_max)}`
      : "";
  // Citra WISE dilukis dengan aturan regangan yang sama dengan frame SPHEREx.
  const targetName = target?.name;
  const firstWise = wise?.frames[0];
  const firstWiseImage = images.get(firstWise && targetId ? assetUrl(targetId, custom, firstWise.image) : undefined);
  // Hanya untuk bundle lama: yang baru sudah ditulis pipeline dengan aturan itu.
  const soften = shownWise && wise && !wise.matched ? WISE_SOFTEN_ARCSEC / wise.pixel_arcsec : 0;
  const tone =
    shownWise && wise && !wise.matched && firstWiseImage && targetId
      ? wiseTone(targetId, firstWiseImage, soften)
      : undefined;
  // Reveal faint ditumpuk di atas penyetaraan nada WISE kalau keduanya berlaku.
  const shownTone = useMemo(() => {
    if (!reveal) return tone;
    if (!tone) return REVEAL_LUT;
    const both = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) both[v] = REVEAL_LUT[tone[v]];
    return both;
  }, [reveal, tone]);
  const description = !target
    ? "Infrared image"
    : shownWise
      ? `WISE infrared image of the sky around ${target.name}, ${dateLabel}. For viewing only; positions are measured on SPHEREx.`
      : win && band
        ? `SPHEREx infrared image of ${target.name}, ${bandLabel}, ${dateLabel}. ${shift}`
        : "SPHEREx infrared image";

  // Bagian langit yang tampil di lensa, berpusat di posisi bundle: sekali dalam
  // piksel frame SPHEREx (untuk tanda dan jejak), sekali dalam piksel citra yang tampil.
  const viewArcsec = useZoomTween(
    manifest ? Math.min(zoomArcsec, manifest.fov_arcsec) : CLOSE_ARCSEC,
    zoomerRef,
    !collapsed,
  );

  // Latar dipusatkan tepat di bawah lensa. Dari skalanya didapat seberapa kecil
  // lensa harus menutup supaya isinya berimpit dengan latar.
  const geometry = useSkyGeometry(appRef, slotRef, targetId);
  const ctx = manifest?.context ?? undefined;
  const skyScale = geometry && ctx ? geometry.size / ctx.fov_arcsec : undefined; // piksel per detik busur
  const collapseScale = skyScale && geometry ? (viewArcsec * skyScale) / geometry.lens : 0.4;
  // Ke mana peta seluruh langit harus sejajar di akhir menyelam: pusat lensa di layar
  // dan skala pandangan lebar, supaya bintangnya berimpit dengan latar di bawahnya.
  const skyHandoff = useCallback((): Handoff | undefined => {
    const box = appRef.current?.getBoundingClientRect();
    if (!box || !geometry) return undefined;
    return { clientX: box.left + geometry.x, clientY: box.top + geometry.y, pxPerArcsec: geometry.size / WIDE_ARCSEC };
  }, [geometry]);
  const arrivedAtAtlas = useCallback(() => {
    window.clearTimeout(atlasTimer.current);
    setAtlasFx(undefined);
  }, []);
  const footprintPx =
    skyScale && manifest ? manifest.fov_arcsec * skyScale : geometry ? geometry.lens * 0.4 : 200;
  const ctxBand = manifest?.bands.find((b) => b.id === ctx?.band);
  const markView = useMemo(() => {
    const px = manifest?.frame_px ?? 240;
    const w = (viewArcsec / (manifest?.fov_arcsec ?? CLOSE_ARCSEC)) * px;
    return { x: (px - w) / 2, y: (px - w) / 2, w, h: w };
  }, [manifest, viewArcsec]);
  const imageView = useMemo(() => {
    if (!shownWise || !wise) return markView;
    const w = viewArcsec / wise.pixel_arcsec;
    return { x: wise.target_px[0] + 0.5 - w / 2, y: wise.target_px[1] + 0.5 - w / 2, w, h: w };
  }, [shownWise, wise, viewArcsec, markView]);

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

  // Berbagi: begitu bundle lengkap, Share membuka kartu. Selagi bundle masih dibuat
  // yang dibagikan tautannya: lembar berbagi sistem di ponsel, salin di tempat lain.
  const canDrawCard = !atlas && !!manifest && !manifest.preview;
  const share = useCallback(() => {
    if (canDrawCard) {
      setCardOpen(true);
      return;
    }
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      const title = !atlas && targetName ? `${targetName} on SWARA` : "SWARA";
      const text = atlas
        ? "The whole sky as SPHEREx saw it. Pick a place and watch it change."
        : "Watch this patch of sky change and hear its spectrum.";
      void navigator
        .share({ title, text, url: window.location.href })
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) copyLink();
        });
    } else copyLink();
  }, [targetName, canDrawCard, copyLink, atlas]);

  // Bahan kartu: citra yang sudah termuat untuk tempat ini, spektrumnya, dan tautan
  // pendek ke tempat yang sama. Hanya disusun selagi dialognya terbuka.
  // Bacaan (pengganti Guide) memakai bahan yang sama dengan kartu berbagi.
  const deckOpen = cardOpen || (notesOpen && !atlas);
  useEffect(() => {
    if (deckOpen && contextUrl) preload([contextUrl]);
  }, [deckOpen, contextUrl]);
  const cardContext = images.get(deckOpen ? contextUrl : undefined);
  const cardWindow = available[available.length - 1];
  const cardFrame = manifest && cardWindow && bandId ? findFrame(manifest, cardWindow.id, bandId) : undefined;
  const cardFrameImage = images.get(deckOpen && cardFrame && targetId ? assetUrl(targetId, custom, cardFrame.image) : undefined);
  const cardWise =
    deckOpen && wise && targetId
      ? wise.frames.flatMap((f) => images.get(assetUrl(targetId, custom, f.image)) ?? [])
      : [];
  const cardWiseCount = cardWise.length;
  const cardPoints = spectrum?.data?.points;
  const cataloguePm = job?.pm_arcsec_yr;
  const jobRa = job?.ra;
  const jobDec = job?.dec;
  const jobLabel = job?.label;
  const cardInput = useMemo<CardInput | undefined>(() => {
    if (!deckOpen || !manifest || !target || !targetId) return undefined;
    if (!cardWiseCount && !cardFrameImage) return undefined;
    const link = new URLSearchParams();
    if (jobRa !== undefined && jobDec !== undefined) {
      link.set("ra", jobRa.toFixed(4));
      link.set("dec", jobDec.toFixed(4));
      if (jobLabel) link.set("name", jobLabel);
    } else link.set("target", targetId);
    return {
      name: target.name,
      manifest,
      look: palette,
      url: `${window.location.origin}${window.location.pathname}?${link}`,
      site: window.location.host,
      context: cardContext,
      wiseImages: cardWise,
      wiseTone:
        wise && !wise.matched && cardWise[0]
          ? wiseTone(targetId, cardWise[0], WISE_SOFTEN_ARCSEC / wise.pixel_arcsec)
          : undefined,
      frame:
        cardFrameImage && cardFrame && cardWindow
          ? { image: cardFrameImage, bandId: cardFrame.band, mjd: cardWindow.mjd_mid }
          : undefined,
      points: cardPoints,
      blended: custom ? undefined : BLENDED[targetId],
      cataloguePm,
      today: new Date(),
    };
    // `cardWise` berganti tiap render; jumlahnya yang menandai citra baru termuat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckOpen, manifest, target, targetId, custom, palette, cardContext, cardWiseCount, cardFrameImage, cardPoints, cataloguePm, jobRa, jobDec, jobLabel]);

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

  const readingPlace = useMemo<ReadingPlace | undefined>(() => {
    if (atlas || !target || !targetId) return undefined;
    return {
      name: target.name,
      kind,
      note,
      ra: manifest?.ra ?? target.ra,
      dec: manifest?.dec ?? target.dec,
      manifest,
      input: cardInput,
      asset: (path: string) => assetUrl(targetId, custom, path),
      blended: custom ? undefined : BLENDED[targetId],
      cataloguePm,
      spectrumPending: !spectrum?.data && !spectrum?.error,
    };
  }, [atlas, target, targetId, kind, note, manifest, cardInput, custom, cataloguePm, spectrum]);

  return (
    <div className="app" ref={appRef} data-focus={focus && !atlas}>
      <Backdrop
        id={target?.id}
        url={contextUrl}
        size={manifest?.context?.size_px}
        lut={LUTS[backdropPalette(palette)]}
        tone={reveal ? REVEAL_LUT : undefined}
        geometry={geometry}
        bright={collapsed}
        bearing={route.bearing}
        slewMs={slew?.ms ?? 1100}
        travel={Math.min(44, 12 + (slew?.degrees ?? 0) * 0.35)}
      />

      <header className="top">
        {/* Tanda SWARA adalah jalan pulang ke seluruh langit. */}
        <button
          type="button"
          className="brand"
          aria-label={atlas ? "SWARA: the whole sky" : "SWARA: see the whole sky"}
          onClick={() => (atlas ? skyRef.current?.reset() : enterAtlas())}
        >
          <LogoMark size={22} />
          <Wordmark height={15} />
        </button>
        <button type="button" className="goto-trigger" onClick={openGoTo}>
          <MagnifyingGlass aria-hidden="true" />
          <span>Go to a place in the sky</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
        <div className="top-actions">
          {atlas && target && (
            <button type="button" className="pill pill-back" aria-label={`Back to ${target.name}`} onClick={backToPlace}>
              <CaretLeft aria-hidden="true" />
              <span>{target.name}</span>
            </button>
          )}
          <button
            type="button"
            className="pill pill-cards"
            aria-label={atlas ? "The whole sky in one card" : "This place in three cards"}
            aria-expanded={notesOpen}
            data-new={!guideSeen}
            onClick={openGuide}
          >
            <Cards aria-hidden="true" />
            <span>The cards</span>
          </button>
          {!atlas && (
            <button type="button" className="round" aria-label="See the whole sky" title="Whole sky" onClick={enterAtlas}>
              <StarFour aria-hidden="true" />
            </button>
          )}
          <button type="button" className="round" aria-label={copied ? "Link copied" : "Share this view"} title="Share" onClick={share}>
            <ShareNetwork aria-hidden="true" />
          </button>
          {!atlas && (
            <button type="button" className="round" aria-label="Focus on the object" title="Focus (F)" onClick={toggleFocus}>
              <CornersOut aria-hidden="true" />
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {copied ? "Link copied" : ""}
          </span>
        </div>
      </header>

      {focus && !atlas && (
        <button type="button" className="round focus-exit" aria-label="Leave focus" title="Leave focus (F)" onClick={toggleFocus}>
          <CornersIn aria-hidden="true" />
        </button>
      )}

      <main className="stage" inert={atlas}>
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
          view={imageView}
          tone={shownTone}
          soften={soften}
          source={`${targetId ?? ""}:${shownWise ? "wise" : "spherex"}`}
          markView={markView}
          viewArcsec={viewArcsec}
          mark={mark}
          trail={path}
          currentId={shownWise ? undefined : windowId}
          dateLabel={dateLabel}
          bandLabel={bandLabel}
          description={description}
          status={status}
          statusText={statusText}
          statusHint={pending ? "A new place takes a few minutes the first time. After that it opens straight away." : undefined}
          progress={progress}
          onRetry={retry}
          soundRing={soundRing}
          slotRef={slotRef}
          zoomerRef={zoomerRef}
          collapsed={collapsed}
          collapseScale={collapseScale}
          footprintPx={footprintPx}
          reticle={slewing || !landed ? "slewing" : "idle"}
          reticleLabel={target ? `Look closer at ${target.name}` : "Look closer"}
          onExpand={() => setSky(false)}
          onWheelZoom={zoom}
          caption={
            slewing && slew ? (
              <SlewReadout slew={slew} />
            ) : sky && ctx ? (
              <>
                <b>Wide view</b>
                <span>SPHEREx {ctxBand ? microns(ctxBand.lambda_min, ctxBand.lambda_max) : ""}</span>
                <span>{Math.round(ctx.fov_arcsec / 60)}′ field</span>
              </>
            ) : undefined
          }
        >
          <button
            type="button"
            className="satellite"
            style={{ "--a": "126deg" } as React.CSSProperties}
            aria-expanded={wheelOpen}
            aria-label="Choose a look"
            data-tip={`Look: ${LOOKS.find((l) => l.id === palette)?.name}`}
            onClick={() => setWheelOpen((v) => !v)}
          >
            <Palette aria-hidden="true" />
          </button>
          {/* Roda filter: enam look terkurasi, berjajar di cincin seperti filter teleskop. */}
          {wheelOpen &&
            LOOKS.map((look, i) => (
              <button
                key={look.id}
                type="button"
                className="satellite swatch"
                style={{ "--a": `${112 - i * 11}deg`, background: lookGradient(look.id, "135deg") } as React.CSSProperties}
                aria-pressed={look.id === palette}
                aria-label={`${look.name} look`}
                data-tip={look.name}
                onClick={() => setPalette(look.id)}
              />
            ))}
          <button
            type="button"
            className="satellite"
            style={{ "--a": "166deg" } as React.CSSProperties}
            aria-pressed={reveal}
            aria-label="Reveal faint things"
            data-tip="Reveal faint"
            onClick={() => setReveal((v) => !v)}
          >
            <SunDim aria-hidden="true" />
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
          {zoomLevels.length > 0 && (
            <>
              <button
                type="button"
                className="satellite satellite-left"
                style={{ "--a": "214deg" } as React.CSSProperties}
                aria-label={zoomIndex > 0 ? "Zoom out" : canSky ? "Step back to the wide view" : "Step back to the whole sky"}
                data-tip={zoomIndex > 0 ? "Zoom out" : canSky ? "Wide view" : "Whole sky"}

                onClick={() => zoom(-1)}
              >
                <MagnifyingGlassMinus aria-hidden="true" />
              </button>
              <button
                type="button"
                className="satellite satellite-left"
                style={{ "--a": "234deg" } as React.CSSProperties}
                aria-label="Zoom in"
                data-tip="Zoom in"
                disabled={zoomIndex === zoomLevels.length - 1}
                onClick={() => zoom(1)}
              >
                <MagnifyingGlassPlus aria-hidden="true" />
              </button>
            </>
          )}
        </Lens>

        <section className="finding" aria-label="What was measured">
          {manifest?.preview && job && (
            <>
              <p className="finding-word">Collecting</p>
              <p className="finding-number">{expected ? `${collected} / ${expected}` : "…"}</p>
              <p className="finding-detail">
                SPHEREx exposures read. The measured shift and the spectrum appear when all are in.
              </p>
            </>
          )}
          {!manifest?.preview && found?.kind === "moved" && (
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
          {!manifest?.preview && found?.kind === "still" && (
            <>
              <p className="finding-word">Holding still</p>
              <p className="finding-number">&lt; {found.tolerance.toFixed(1)}″</p>
              <p className="finding-detail">no shift measured across {found.visits} visits</p>
            </>
          )}
          {!manifest?.preview && found?.kind === "none" && (
            <>
              <p className="finding-word">Not trackable</p>
              <p className="finding-detail">
                {custom
                  ? "Nothing at the centre could be tracked between visits."
                  : "The position could not be measured reliably for this target."}
              </p>
            </>
          )}
          {(found || manifest?.preview) && job?.pm_arcsec_yr != null && job.pm_arcsec_yr >= 0.1 && (
            <p className="finding-catalogue">Catalogue: {job.pm_arcsec_yr.toFixed(1)}″ per year</p>
          )}
        </section>
      </main>

      <section className="dock" aria-label="Controls" inert={atlas}>
        <div className="dock-row">
          <div className="dock-lead">
            <button
              type="button"
              className="dial dial-accent"
              onClick={() => {
                setSky(false);
                setPlaying((v) => !v);
              }}
              disabled={sequence.length < 2}
              aria-pressed={playing}
              aria-label={playing ? "Pause" : long ? "Play 16 years of images" : "Blink between visits"}
            >
              {playing && sequence.length > 1 ? <Pause weight="fill" /> : <Play weight="fill" />}
            </button>
            <span className="dial-text">
              <span className="dial-kicker" aria-hidden="true">
                <b>II</b> Path
              </span>
              <span className="dial-caption">{playing && sequence.length > 1 ? "Pause" : long ? "Play" : "Blink"}</span>
            </span>
          </div>
          <div className="timebar">
            {wise && !manifest?.preview && (
              <div className="era" role="group" aria-label="Time span">
                <button type="button" aria-pressed={long} onClick={() => chooseEra("long")}>
                  16 years
                </button>
                <button type="button" aria-pressed={!long} onClick={() => chooseEra("spherex")}>
                  SPHEREx
                </button>
              </div>
            )}
            <button
              type="button"
              className="round"
              aria-label={long ? "Previous image" : "Previous visit"}
              disabled={sequence.length < 2}
              onClick={() => {
                setPlaying(false);
                step(-1);
              }}
            >
              <CaretLeft aria-hidden="true" />
            </button>
            {manifest && long && wise ? (
              <LongTimeline
                wise={wise.frames}
                visits={available}
                current={cursor >= 0 ? sequence[cursor] : undefined}
                onSelect={(f) => {
                  setPlaying(false);
                  show(f);
                }}
              />
            ) : manifest && windowId ? (
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
              aria-label={long ? "Next image" : "Next visit"}
              disabled={sequence.length < 2}
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
          {job && pending ? (
            <CollectingStrip
              bands={manifest?.bands ?? []}
              seen={job.seen_um ?? []}
              done={collected}
              total={expected}
              stage={job.stage}
            />
          ) : manifest && !manifest.preview ? (
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

      {atlas && (
        <SkyMap
          ref={skyRef}
          atlas={atlasData}
          failed={atlasFailed}
          band={skyBand}
          onBand={setSkyBand}
          look={palette}
          onPalette={setPalette}
          reveal={reveal}
          lines={skyLines}
          onLines={setSkyLines}
          markers={skyMarkers}
          onPick={pickFromAtlas}
          onGo={async (ra, dec) => {
            const result = await openSky(`${ra.toFixed(4)} ${dec.toFixed(4)}`, true);
            if (typeof result === "string") return result;
            leaveAtlas(result);
            return null;
          }}
          onTour={() => {
            const tour = targets?.find((t) => t.id === TOUR_ID) ?? targets?.find((t) => t.kind === "moving");
            if (tour) pickFromAtlas(tour.id);
          }}
          arrive={atlasFx?.kind === "enter" ? atlasFx : undefined}
          onArrived={arrivedAtAtlas}
          leaving={atlasFx?.kind === "leave"}
          handoff={skyHandoff}
          tour={targets?.find((t) => t.id === TOUR_ID)}
          busy={gotoOpen || notesOpen || cardOpen}
        />
      )}

      <GoTo
        open={gotoOpen}
        onClose={() => setGotoOpen(false)}
        query={query}
        onQuery={setQuery}
        busy={formBusy}
        error={formError}
        onSubmit={(text) =>
          void openSky(text, atlas).then((result) => {
            if (typeof result === "string") return;
            setGotoOpen(false);
            if (atlas) leaveAtlas(result);
          })
        }
        examples={targets ?? []}
        yours={allTargets.filter((t) => t.kind === "custom")}
        building={new Set(Object.values(jobs).filter((j) => j.status !== "ready").map((j) => j.id))}
        currentId={targetId}
        onPick={(id) => {
          setGotoOpen(false);
          const t = allTargets.find((x) => x.id === id);
          if (atlas && t) pickFromAtlas(id);
          else selectTarget(id);
        }}
        atlas={atlasData}
        look={palette}
      />
      <ShareCard
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        input={cardInput}
        lookName={LOOKS.find((l) => l.id === palette)?.name ?? ""}
        spectrumPending={!spectrum?.data && !spectrum?.error}
        copied={copied}
        onCopyLink={copyLink}
      />
      <Reading
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        look={palette}
        atlas={atlasData}
        sky={atlas ? { band: skyBand, places: skyMarkers } : undefined}
        place={readingPlace}
        canShare={canDrawCard}
        onShare={() => {
          setNotesOpen(false);
          setCardOpen(true);
        }}
        onWholeSky={() => {
          setNotesOpen(false);
          enterAtlas();
        }}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {atlas ? "" : sky && target ? `Wide view of the sky around ${target.name}.` : playing ? "" : shownWise ? `${dateLabel}, ${bandLabel}.` : win ? `${dateLabel}, ${bandLabel}. ${shift}` : ""}
      </p>
    </div>
  );
}
