import { useEffect, useRef } from "react";
import { FLAG_BAD, FLAG_SATURATED, LUTS, type PaletteId } from "../lib/palette";

type Props = {
  image?: HTMLImageElement;
  mask?: HTMLImageElement;
  palette: PaletteId;
  showFlags: boolean;
  sizePx: number;
  fovArcsec: number;
  /** Posisi acuan di piksel frame; tetap di langit yang sama untuk semua jendela. */
  mark?: { x: number; y: number };
  dateLabel: string;
  bandLabel: string;
  description: string;
  status?: "loading" | "error";
  onRetry?: () => void;
};

const SCALE_ARCSEC = 20;

function pixels(img: HTMLImageElement, size: number, scratch: HTMLCanvasElement) {
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export function SkyStage(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !p.image) return;
    const size = p.sizePx;
    const scratch = (scratchRef.current ??= document.createElement("canvas"));
    scratch.width = scratch.height = size;

    const gray = pixels(p.image, size, scratch);
    const out = new ImageData(size, size);
    const lut = LUTS[p.palette];
    for (let i = 0; i < size * size; i++) {
      const v = gray[i * 4] * 3;
      out.data[i * 4] = lut[v];
      out.data[i * 4 + 1] = lut[v + 1];
      out.data[i * 4 + 2] = lut[v + 2];
      out.data[i * 4 + 3] = 255;
    }
    if (p.showFlags && p.mask) {
      const m = pixels(p.mask, size, scratch);
      for (let i = 0; i < size * size; i++) {
        const tint = m[i * 4] > 200 ? FLAG_SATURATED : m[i * 4] > 64 ? FLAG_BAD : null;
        if (!tint) continue;
        for (let c = 0; c < 3; c++) out.data[i * 4 + c] = out.data[i * 4 + c] * 0.4 + tint[c] * 0.6;
      }
    }
    canvas.getContext("2d")!.putImageData(out, 0, 0);
  }, [p.image, p.mask, p.palette, p.showFlags, p.sizePx]);

  const s = p.sizePx;
  const gap = s * 0.028;
  const arm = s * 0.04;

  return (
    <div className="stage">
      <canvas
        ref={canvasRef}
        width={s}
        height={s}
        role="img"
        aria-label={p.description}
        className={p.image ? "sky" : "sky sky-empty"}
      />

      {p.mark && p.image && (
        <svg className="overlay" viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
          <g className="mark" transform={`translate(${p.mark.x} ${p.mark.y})`}>
            <line x1={-gap - arm} y1={0} x2={-gap} y2={0} />
            <line x1={gap} y1={0} x2={gap + arm} y2={0} />
            <line x1={0} y1={-gap - arm} x2={0} y2={-gap} />
            <line x1={0} y1={gap} x2={0} y2={gap + arm} />
          </g>
        </svg>
      )}

      <div className="stage-date" aria-hidden="true">
        <span className="stage-date-main">{p.dateLabel}</span>
        <span className="stage-date-sub">{p.bandLabel}</span>
      </div>

      <div className="compass" aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <path d="M34 34 V10 M34 34 H10" />
          <path d="M30.5 14 L34 9 L37.5 14 M14 30.5 L9 34 L14 37.5" />
        </svg>
        <span className="compass-n">N</span>
        <span className="compass-e">E</span>
      </div>

      <div className="scale" style={{ width: `${(SCALE_ARCSEC / p.fovArcsec) * 100}%` }} aria-hidden="true">
        <span>{SCALE_ARCSEC}″</span>
      </div>

      {p.status === "loading" && (
        <div className="stage-status" role="status">
          Loading sky…
        </div>
      )}
      {p.status === "error" && (
        <div className="stage-status" role="alert">
          <p>This view could not be loaded.</p>
          {p.onRetry && (
            <button type="button" className="btn" onClick={p.onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
