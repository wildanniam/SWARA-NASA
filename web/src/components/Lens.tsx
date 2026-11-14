import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { paint, type Rect } from "../lib/paint";
import { LUTS, type PaletteId } from "../lib/palette";

type Props = {
  image?: HTMLImageElement;
  mask?: HTMLImageElement;
  palette: PaletteId;
  showFlags: boolean;
  /** Bagian citra yang tampil, dalam piksel citra itu. */
  view?: Rect;
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
  /** Tombol kecil yang menempel di cincin. */
  children?: ReactNode;
};

const CANVAS_PX = 480;
const R = 100; // jari-jari lensa dalam satuan gambar cincin
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

export function Lens(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !p.image) return;
    paint(canvasRef.current, p.image, LUTS[p.palette], CANVAS_PX, p.showFlags ? p.mask : undefined, p.view);
  }, [p.image, p.mask, p.palette, p.showFlags, p.view]);

  // Ukuran tanda mengikuti lebar yang tampil, jadi tetap sama besar di layar saat diperbesar.
  const s = p.markView.w;
  const scaleArcsec = p.viewArcsec >= 240 ? 60 : 20;
  const gap = s * 0.026;
  const arm = s * 0.036;
  const open = !!p.image && !p.status;
  const moved = p.trail.length > 1 && p.trail.some((t) => Math.hypot(t.x - p.trail[0].x, t.y - p.trail[0].y) > 1.5);
  const loadPct = p.progress && p.progress.total > 0 ? (p.progress.done / p.progress.total) * 100 : undefined;

  return (
    <div className="lens" data-open={open} data-status={p.status ?? "ready"}>
      <div className="lens-body">
        <div className="lens-aperture">
          <canvas ref={canvasRef} width={CANVAS_PX} height={CANVAS_PX} role="img" aria-label={p.description} />
          <svg
            className="lens-marks"
            viewBox={`${p.markView.x} ${p.markView.y} ${p.markView.w} ${p.markView.h}`}
            aria-hidden="true"
          >
            {moved && (
              <>
                <polyline className="trail-line" points={p.trail.map((t) => `${t.x},${t.y}`).join(" ")} />
                {/* Kunjungan pertama sudah ditandai tanda silang, jadi titiknya mulai dari yang kedua. */}
                {p.trail.slice(1).map((t) => (
                  <g key={t.id}>
                    <circle className="trail-halo" cx={t.x} cy={t.y} r={s * 0.009} />
                    <circle className="trail-dot" data-current={t.id === p.currentId} cx={t.x} cy={t.y} r={s * 0.009} />
                  </g>
                ))}
              </>
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
          <text className="ring-label" x={0} y={-(R + 12.5)} textAnchor="middle">
            N
          </text>
          <text className="ring-label" x={-(R + 14.5)} y={1.8} textAnchor="middle">
            E
          </text>
          {p.status === "loading" && (
            <circle
              className={loadPct === undefined ? "ring-arc ring-spin" : "ring-arc"}
              r={R + 2.2}
              pathLength={100}
              strokeDasharray={`${loadPct ?? 18} 100`}
              transform="rotate(-90)"
            />
          )}
          <circle
            ref={p.soundRing}
            className="ring-arc ring-sound"
            r={R + 2.2}
            pathLength={100}
            strokeDasharray="0 100"
            transform="rotate(-90)"
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

        {p.children}
      </div>

      <p className="lens-caption" aria-hidden="true">
        {open && (
          <>
            <b>{p.dateLabel}</b>
            <span>{p.bandLabel}</span>
            <span>{Math.round(p.viewArcsec / 60)}′ wide</span>
          </>
        )}
      </p>
    </div>
  );
}
