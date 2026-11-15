import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { decDms, raHms } from "../lib/allsky";
import { prefersReducedMotion } from "../lib/hooks";
import { paint, paintDifference, type Linear, type Rect } from "../lib/paint";
import { LUTS, type PaletteId } from "../lib/palette";
import { CROWN_DEG, type SoundArt } from "../lib/soundArt";

type Props = {
  image?: HTMLImageElement;
  mask?: HTMLImageElement;
  palette: PaletteId;
  showFlags: boolean;
  /** Bagian citra yang tampil, dalam piksel citra itu. */
  view?: Rect;
  /** Pemetaan ulang tingkat abu sebelum diwarnai; dipakai untuk citra WISE. */
  tone?: Uint8ClampedArray;
  /** Penghalusan sebelum diwarnai, dalam piksel citra; dipakai untuk citra WISE. */
  soften?: number;
  /** Citra selisih: `image` dikurangi citra acuan ini (pengamatan pertama teleskop yang sama). */
  difference?: { reference: HTMLImageElement; scale?: Linear; tone?: Uint8ClampedArray };
  /** Bintang katalog Gaia di posisinya pada tanggal citra yang tampil, piksel frame.
   *  `tail` = dari mana bintang cepat itu datang sejak pengamatan pertama. */
  stars?: { x: number; y: number; g: number; tail?: { x: number; y: number } }[];
  /** Cara citra dilukis (selisih, look, Reveal faint, penanda piksel). Saat ini berganti di
   *  tempat yang sama, citra lama tersapu oleh citra baru, seperti filter teleskop yang diputar. */
  mode?: string;
  /** Pusat frame di langit dan skalanya, untuk membaca RA/Dec di bawah kursor. */
  pointing?: { ra: number; dec: number; fovArcsec: number; framePx: number };
  /** Tempat dan teleskop citra yang tampil, "tempat:teleskop". Saat teleskopnya
   *  berganti di tempat yang sama, citra lama larut ke citra baru. */
  source: string;
  /** Bagian yang sama dalam piksel frame SPHEREx; tanda dan jejak digambar di sini. */
  markView: Rect;
  /** Lebar langit yang tampil, detik busur. */
  viewArcsec: number;
  /** Posisi acuan di piksel frame; tetap di langit yang sama untuk semua kunjungan. */
  mark?: { x: number; y: number };
  /** Posisi terukur tiap kunjungan di piksel frame. */
  trail: { id: string; x: number; y: number }[];
  currentId?: string;
  dateLabel: string;
  bandLabel: string;
  description: string;
  status?: "loading" | "error";
  statusText?: string;
  statusHint?: string;
  /** Progres pembuatan bundle; tanpa ini cincin berputar tanpa ukuran. */
  progress?: { done: number; total: number };
  onRetry?: () => void;
  /** Busur di cincin yang digerakkan langsung oleh pemutar suara. */
  soundRing: RefObject<SVGCircleElement | null>;
  /** Garis pindai vertikal; digerakkan langsung oleh sapuan gambar. */
  scanLineRef: RefObject<SVGLineElement | null>;
  /** Tanda dari suara yang sedang berbunyi; diisi langsung oleh pemutar. */
  soundArt: RefObject<SoundArt>;
  /** Kotak tata letak lensa; diukur supaya latar bisa dipusatkan di bawahnya. */
  slotRef: RefObject<HTMLDivElement | null>;
  /** Isi lensa yang dibesarkan dan dikecilkan saat berganti pembesaran. */
  zoomerRef: RefObject<HTMLDivElement | null>;
  /** Lensa menutup ke pandangan lebar: mengecil sampai isinya seukuran latar, lalu larut. */
  collapsed: boolean;
  /** Skala lensa saat tertutup: pada skala ini isinya tepat seukuran latar. */
  collapseScale: number;
  /** Garis tengah, piksel, petak langit di latar yang akan diperbesar lensa. */
  footprintPx: number;
  /** Cincin di pandangan lebar: bisa diklik untuk mendekat, atau sedang mencari. */
  reticle: "idle" | "slewing";
  reticleLabel: string;
  onExpand: () => void;
  /** Gulir di atas lensa: 1 mendekat, -1 menjauh. */
  onWheelZoom: (dir: 1 | -1) => void;
  /** Pengganti baris keterangan, misalnya pembacaan koordinat saat berpindah. */
  caption?: ReactNode;
  /** Catatan tambahan di ujung baris keterangan. */
  note?: string;
  /** Tombol kecil yang menempel di cincin. */
  children?: ReactNode;
};

const CANVAS_PX = 480;
const DISSOLVE_MS = 700;
const SWEEP_MS = 640;
const GAIA_OUT_MS = 380;
const WHEEL_GAP_MS = 240;
const R = 100; // jari-jari lensa dalam satuan gambar cincin
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

export function Lens(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLCanvasElement>(null);
  const lastSource = useRef<string | undefined>(undefined);
  const dissolve = useRef<{ animation?: Animation; timer: number }>({ timer: 0 });
  const sweepRef = useRef<HTMLDivElement>(null);
  const lastMode = useRef<string | undefined>(undefined);
  const lastPlace = useRef<string | undefined>(undefined);
  const sweep = useRef<{ animations: Animation[]; timer: number }>({ animations: [], timer: 0 });
  // Naik tiap kali teleskop berganti, supaya keterangan di bawah lensa ikut memberi tanda.
  const [cue, setCue] = useState(0);

  // Dilukis sebelum browser menggambar, supaya pergantian pembesaran tidak berkedip.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const fade = fadeRef.current;
    if (!canvas || !p.image) return;
    // Blink dalam satu teleskop tetap meloncat, karena loncatan itulah yang dibaca
    // mata sebagai gerak. Pergantian teleskop bukan perbandingan posisi: citranya
    // berbeda alat, jadi citra lama dilarutkan ke citra baru.
    const [place, telescope] = p.source.split(":");
    const [prevPlace, lastTelescope] = (lastSource.current ?? ":").split(":");
    const calm = prefersReducedMotion();
    const handover = place === prevPlace && telescope !== lastTelescope && !calm;
    // Ganti cara melukis di tempat yang sama: citra lama tersapu dari kiri ke kanan.
    const restyle = !handover && !calm && place === lastPlace.current && lastMode.current !== undefined && lastMode.current !== p.mode;
    lastSource.current = p.source;
    lastPlace.current = place;
    lastMode.current = p.mode;
    if ((handover || restyle) && fade) {
      window.clearTimeout(dissolve.current.timer);
      window.clearTimeout(sweep.current.timer);
      dissolve.current.animation?.cancel();
      sweep.current.animations.forEach((a) => a.cancel());
      const ctx = fade.getContext("2d")!;
      ctx.clearRect(0, 0, fade.width, fade.height);
      ctx.drawImage(canvas, 0, 0);
      fade.style.opacity = "1";
    }
    if (p.difference)
      paintDifference(canvas, p.image, p.difference.reference, CANVAS_PX, p.view, p.difference.scale, p.difference.tone, p.soften);
    else paint(canvas, p.image, LUTS[p.palette], CANVAS_PX, p.showFlags ? p.mask : undefined, p.view, p.tone, p.soften);
    if (handover && fade) {
      if (typeof fade.animate === "function") {
        dissolve.current.animation = fade.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: DISSOLVE_MS,
          easing: "ease-in-out",
        });
      }
      // Pewaktu yang menutupnya, supaya tidak tertahan kalau halaman tidak sedang digambar.
      fade.style.opacity = "0";
      dissolve.current.timer = window.setTimeout(() => dissolve.current.animation?.cancel(), DISSOLVE_MS + 60);
      setCue((n) => n + 1);
    } else if (restyle && fade) {
      const line = sweepRef.current;
      const easing = "cubic-bezier(0.65, 0, 0.35, 1)";
      if (typeof fade.animate === "function") {
        sweep.current.animations = [
          fade.animate(
            [
              { clipPath: "inset(0 0 0 0%)", opacity: 1 },
              { clipPath: "inset(0 0 0 100%)", opacity: 1 },
            ],
            { duration: SWEEP_MS, easing },
          ),
        ];
        if (line)
          sweep.current.animations.push(
            line.animate(
              [
                { left: "0%", opacity: 0 },
                { left: "8%", opacity: 1, offset: 0.08 },
                { left: "92%", opacity: 1, offset: 0.92 },
                { left: "100%", opacity: 0 },
              ],
              { duration: SWEEP_MS, easing },
            ),
          );
      }
      fade.style.opacity = "0";
      sweep.current.timer = window.setTimeout(() => sweep.current.animations.forEach((a) => a.cancel()), SWEEP_MS + 60);
    }
  }, [p.image, p.mask, p.palette, p.showFlags, p.view, p.tone, p.soften, p.source, p.difference, p.mode]);

  // Cincin Gaia mengunci satu per satu saat dinyalakan, dan memudar saat dimatikan.
  const [gaia, setGaia] = useState(p.stars);
  const [gaiaLeaving, setGaiaLeaving] = useState(false);
  useEffect(() => {
    if (p.stars) {
      setGaia(p.stars);
      setGaiaLeaving(false);
      return;
    }
    if (prefersReducedMotion()) {
      setGaia(undefined);
      return;
    }
    setGaiaLeaving(true);
    const t = window.setTimeout(() => setGaia(undefined), GAIA_OUT_MS);
    return () => window.clearTimeout(t);
  }, [p.stars]);

  // Bacaan teleskop di bawah kursor: RA/Dec titik itu, jaraknya dari tanda, dan arah di cincin.
  const readRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<SVGGElement>(null);
  const [hovering, setHovering] = useState(false);
  const pointing = useRef(p.pointing);
  pointing.current = p.pointing;
  const marks = useRef({ view: p.markView, mark: p.mark });
  marks.current = { view: p.markView, mark: p.mark };
  const onLensMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const read = readRef.current;
    const pt = pointing.current;
    const box = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - box.left) / box.width;
    const v = (e.clientY - box.top) / box.height;
    const dx = u - 0.5;
    const dy = v - 0.5;
    if (dx * dx + dy * dy > 0.25) {
      setHovering(false);
      return;
    }
    setHovering(true);
    // Arah dari pusat, diukur dari utara: jarum kecil di cincin mengikutinya.
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    pointerRef.current?.setAttribute("transform", `rotate(${angle.toFixed(1)})`);
    if (!read || !pt) return;
    const { view, mark } = marks.current;
    const fx = view.x + u * view.w;
    const fy = view.y + v * view.h;
    const step = pt.fovArcsec / pt.framePx;
    // Sama dengan sky_grid di pipeline: kolom 0 = timur, baris 0 = utara, pusat = posisi benda.
    const east = -(fx * step - pt.fovArcsec / 2);
    const north = -(fy * step - pt.fovArcsec / 2);
    const dec = pt.dec + north / 3600;
    const ra = (((pt.ra + east / 3600 / Math.cos((pt.dec * Math.PI) / 180)) % 360) + 360) % 360;
    const from = mark ? Math.hypot(fx - mark.x, fy - mark.y) * step : undefined;
    const text = `${raHms(ra)}|${decDms(dec)}|${from === undefined ? "" : from < 1 ? "on the mark" : from < 60 ? `${from.toFixed(0)}″ from the mark` : `${(from / 60).toFixed(1)}′ from the mark`}`;
    if (read.dataset.text !== text) {
      read.dataset.text = text;
      const [a, b, c] = text.split("|");
      (read.children[0] as HTMLElement).textContent = a;
      (read.children[1] as HTMLElement).textContent = b;
      (read.children[2] as HTMLElement).textContent = c;
    }
    const bodyBox = read.parentElement!.getBoundingClientRect();
    const x = e.clientX - bodyBox.left;
    const y = e.clientY - bodyBox.top;
    const flip = u > 0.62;
    read.style.transform = `translate(${(x + (flip ? -18 : 18)).toFixed(1)}px, ${(y + 16).toFixed(1)}px) translateX(${flip ? "-100%" : "0"})`;
  };

  useEffect(() => {
    const state = dissolve.current;
    const wipe = sweep.current;
    return () => {
      window.clearTimeout(state.timer);
      window.clearTimeout(wipe.timer);
    };
  }, []);

  // Gulir memperbesar hanya kalau halaman sendiri tidak perlu digulir.
  const { slotRef, onWheelZoom } = p;
  const wheel = useRef(onWheelZoom);
  wheel.current = onWheelZoom;
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || !e.deltaY) return;
      if (document.documentElement.scrollHeight > window.innerHeight + 2) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last < WHEEL_GAP_MS) return;
      last = now;
      wheel.current(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [slotRef]);

  // Ukuran tanda mengikuti lebar yang tampil, jadi tetap sama besar di layar saat diperbesar.
  const s = p.markView.w;
  const scaleArcsec = p.viewArcsec >= 240 ? 60 : 20;
  const gap = s * 0.026;
  const arm = s * 0.036;
  const open = !!p.image && !p.status;
  const moved = p.trail.length > 1 && p.trail.some((t) => Math.hypot(t.x - p.trail[0].x, t.y - p.trail[0].y) > 1.5);
  const loadPct = p.progress && p.progress.total > 0 ? (p.progress.done / p.progress.total) * 100 : undefined;
  const slotStyle = { "--k": p.collapseScale, "--foot": `${p.footprintPx}px` } as CSSProperties;
  const live = open && !p.collapsed;
  const bellAt = (moved && p.trail.find((t) => t.id === p.currentId)) || p.mark;

  return (
    <div
      className="lens"
      data-open={open}
      data-status={p.status ?? "ready"}
      data-collapsed={p.collapsed}
      data-look={p.palette}
      data-difference={!!p.difference}
      data-hover={hovering && live}
    >
      <div className="lens-slot" ref={p.slotRef} style={slotStyle}>
        <div className="lens-body" inert={p.collapsed}>
          <div className="lens-aperture" onPointerMove={live ? onLensMove : undefined} onPointerLeave={() => setHovering(false)}>
            <div className="lens-zoomer" ref={p.zoomerRef}>
              <canvas ref={canvasRef} width={CANVAS_PX} height={CANVAS_PX} role="img" aria-label={p.description} />
              <canvas ref={fadeRef} className="lens-fade" width={CANVAS_PX} height={CANVAS_PX} aria-hidden="true" />
              <div ref={sweepRef} className="lens-sweep" aria-hidden="true" />
              <svg
                className="lens-marks"
                viewBox={`${p.markView.x} ${p.markView.y} ${p.markView.w} ${p.markView.h}`}
                aria-hidden="true"
              >
                {/* Cincin Gaia: tipis dan dingin, supaya tidak tertukar dengan tanda ambar kita. */}
                {gaia && (
                  <g className="gaia" data-leaving={gaiaLeaving}>
                    {gaia.map((st, i) => {
                      // Makin terang bintangnya, makin besar cincinnya.
                      const r = s * (0.0085 + 0.017 * Math.min(1, Math.max(0, (15 - st.g) / 8)));
                      return (
                        <g key={i} className="gaia-one" style={{ "--i": Math.min(i, 40) } as CSSProperties}>
                          {st.tail && <line className="gaia-tail" x1={st.tail.x} y1={st.tail.y} x2={st.x} y2={st.y} />}
                          <circle className="gaia-halo" cx={st.x} cy={st.y} r={r} />
                          <circle className="gaia-star" cx={st.x} cy={st.y} r={r} />
                        </g>
                      );
                    })}
                  </g>
                )}
                {moved && (
                  <>
                    <polyline className="trail-line" points={p.trail.map((t) => `${t.x},${t.y}`).join(" ")} />
                    {/* Kunjungan pertama sudah ditandai tanda silang, jadi titiknya mulai dari yang kedua. */}
                    {p.trail.slice(1).map((t) => (
                      <g key={t.id}>
                        <circle className="trail-halo" cx={t.x} cy={t.y} r={s * 0.009} />
                        <circle
                          className="trail-dot"
                          data-current={t.id === p.currentId}
                          cx={t.x}
                          cy={t.y}
                          r={s * 0.009}
                        />
                      </g>
                    ))}
                  </>
                )}
                {/* Lonceng gerak: posisi terukur kunjungan yang tampil berdenyut saat nadanya berbunyi. */}
                {bellAt && (
                  <circle
                    ref={(el) => {
                      p.soundArt.current.bell = el;
                    }}
                    className="mark-bell"
                    cx={bellAt.x}
                    cy={bellAt.y}
                    r={s * 0.05}
                  />
                )}
                {/* Digambar dua kali: garis gelap di bawah supaya tanda ambar tetap terbaca di atas inti bintang yang terang. */}
                {p.mark &&
                  ["mark mark-halo", "mark"].map((cls) => (
                    <g key={cls} className={cls} transform={`translate(${p.mark!.x} ${p.mark!.y})`}>
                      <line x1={-gap - arm} y1={0} x2={-gap} y2={0} />
                      <line x1={gap} y1={0} x2={gap + arm} y2={0} />
                      <line x1={0} y1={-gap - arm} x2={0} y2={-gap} />
                      <line x1={0} y1={gap} x2={0} y2={gap + arm} />
                    </g>
                  ))}
              </svg>
              <svg
                className="lens-scan"
                viewBox="0 0 32 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line ref={p.scanLineRef} className="scan-line" x1={-10} y1={0} x2={-10} y2={100} />
              </svg>
              <svg className="lens-pings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <g
                  ref={(el) => {
                    p.soundArt.current.pings = el;
                  }}
                />
              </svg>
            </div>
            <div className="lens-scale" style={{ width: `${(scaleArcsec / p.viewArcsec) * 100}%` }} aria-hidden="true">
              <span>{scaleArcsec === 60 ? "1′" : "20″"}</span>
            </div>
          </div>

          <svg className="lens-ring" viewBox="-118 -118 236 236" aria-hidden="true">
            <circle className="ring-edge" r={R} />
            {TICKS.map((a) => (
              <line
                key={a}
                className="ring-tick"
                x1={0}
                y1={-(R + 4)}
                x2={0}
                y2={-(R + (a % 90 === 0 ? 11 : a % 45 === 0 ? 8 : 6))}
                transform={`rotate(${a})`}
              />
            ))}
            {/* Jarum arah: mengikuti kursor di atas lensa, diukur dari utara. */}
            <g ref={pointerRef} className="ring-pointer">
              <line x1={0} y1={-(R + 3)} x2={0} y2={-(R + 10)} />
              <circle cx={0} cy={-(R + 2.2)} r={1.3} />
            </g>
            <text className="ring-label" x={0} y={-(R + 12.5)} textAnchor="middle">
              N
            </text>
            <text className="ring-label" x={-(R + 14.5)} y={1.8} textAnchor="middle">
              E
            </text>
            {/* Progres juga tampil saat lensa sudah berisi pratinjau dan sisanya masih dikumpulkan. */}
            {(p.status === "loading" || (loadPct !== undefined && p.status !== "error")) && (
              <circle
                className={loadPct === undefined ? "ring-arc ring-spin" : "ring-arc"}
                r={R + 2.2}
                pathLength={100}
                strokeDasharray={`${loadPct ?? 18} 100`}
                transform="rotate(-90)"
              />
            )}
            {/* Mahkota spektrum: satu sinar per nada, pada sudut panjang gelombangnya. */}
            <g
              className="ring-crown"
              ref={(el) => {
                p.soundArt.current.crown = el;
              }}
            />
            <circle
              ref={p.soundRing}
              className="ring-arc ring-sound"
              r={R + 2.2}
              pathLength={100}
              strokeDasharray="0 100"
              transform={`rotate(${-90 - CROWN_DEG / 2})`}
            />
          </svg>

          {p.status === "loading" && (
            <div className="lens-status" role="status">
              <p className="lens-status-main">{p.statusText ?? "Loading sky"}</p>
              {p.progress && p.progress.total > 0 && (
                <p className="lens-status-count" aria-hidden="true">
                  {p.progress.done} / {p.progress.total}
                </p>
              )}
              {p.statusHint && <p className="lens-status-hint">{p.statusHint}</p>}
            </div>
          )}
          {p.status === "error" && (
            <div className="lens-status" role="alert">
              <p className="lens-status-main">{p.statusText ?? "This view could not be loaded."}</p>
              {p.onRetry && (
                <button type="button" className="pill" onClick={p.onRetry}>
                  Try again
                </button>
              )}
            </div>
          )}

          <div ref={readRef} className="lens-read" aria-hidden="true">
            <span />
            <span />
            <em />
          </div>

          {p.children}
        </div>

        {/* Di pandangan lebar, cincin ini menandai petak langit yang diperbesar lensa. */}
        <button
          type="button"
          className="reticle"
          data-state={p.reticle}
          aria-label={p.reticleLabel}
          disabled={!p.collapsed || p.reticle === "slewing"}
          onClick={p.onExpand}
        >
          <svg viewBox="-60 -60 120 120" aria-hidden="true">
            <circle r="50" />
            <path d="M0 -50V-58M0 50V58M-50 0H-58M50 0H58" />
          </svg>
          <span>Look closer</span>
        </button>
      </div>

      <p key={p.mode ?? ""} className={lastMode.current === undefined ? "lens-caption" : "lens-caption caption-swap"} aria-hidden="true">
        {p.caption ??
          (open && !p.collapsed && (
            <>
              <b>{p.dateLabel}</b>
              <span key={cue} className={cue ? "caption-cue" : undefined}>
                {p.bandLabel}
              </span>
              <span>{Math.round(p.viewArcsec / 60)}′ wide</span>
              {p.note && <span className="caption-note">{p.note}</span>}
            </>
          ))}
      </p>
    </div>
  );
}
