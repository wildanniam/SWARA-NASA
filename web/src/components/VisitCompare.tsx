import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useDialog } from "../lib/hooks";
import { paint, type Rect } from "../lib/paint";
import { LUTS, REVEAL_LUT, type PaletteId } from "../lib/palette";

export type CompareImage = {
  image?: HTMLImageElement;
  mask?: HTMLImageElement;
  date: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  first: CompareImage;
  current: CompareImage;
  targetName: string;
  bandLabel: string;
  palette: PaletteId;
  view: Rect;
  showFlags: boolean;
  reveal: boolean;
  onStepCurrent: (direction: -1 | 1) => void;
};

function VisitImage({ image, mask, date, label, bandLabel, palette, view, showFlags, reveal }: CompareImage & {
  label: string;
  bandLabel: string;
  palette: PaletteId;
  view: Rect;
  showFlags: boolean;
  reveal: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const tone = reveal ? REVEAL_LUT : undefined;
    paint(canvas, image, LUTS[palette], 480, showFlags ? mask : undefined, view, tone);
  }, [image, mask, palette, view, showFlags, reveal]);

  return (
    <figure className="visit-compare-frame">
      <figcaption>
        <b>{label}</b>
        <span>{date || "Loading image…"}</span>
      </figcaption>
      <div className="visit-compare-image" data-ready={!!image}>
        <canvas ref={canvasRef} width={480} height={480} role="img" aria-label={`${label}, ${date}, ${bandLabel}`} />
        {!image && <span>Loading SPHEREx image…</span>}
      </div>
    </figure>
  );
}

export function VisitCompare(p: Props) {
  const ref = useDialog<HTMLDivElement>(p.open, p.onClose);
  if (!p.open) return null;

  return (
    <div
      className="scrim scrim-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div ref={ref} className="visit-compare" role="dialog" aria-modal="true" aria-label={`Compare SPHEREx visits for ${p.targetName}`}>
        <div className="visit-compare-head">
          <div>
            <h2>Compare SPHEREx visits</h2>
            <p>{p.targetName} · {p.bandLabel} · same field of view</p>
          </div>
          <button type="button" className="round" aria-label="Close comparison" data-autofocus onClick={p.onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="visit-compare-grid">
          <VisitImage {...p.first} label="First visit" bandLabel={p.bandLabel} palette={p.palette} view={p.view} showFlags={p.showFlags} reveal={p.reveal} />
          <VisitImage {...p.current} label="Current visit" bandLabel={p.bandLabel} palette={p.palette} view={p.view} showFlags={p.showFlags} reveal={p.reveal} />
        </div>
        <div className="visit-compare-controls">
          <button type="button" className="pill" onClick={() => p.onStepCurrent(-1)}>
            <CaretLeft aria-hidden="true" /> Previous visit
          </button>
          <span>Current: {p.current.date || "—"}</span>
          <button type="button" className="pill" onClick={() => p.onStepCurrent(1)}>
            Next visit <CaretRight aria-hidden="true" />
          </button>
        </div>
        <p className="visit-compare-note">Both panels show SPHEREx data from the same detector band and matching sky area. The first visit stays fixed on the left.</p>
      </div>
    </div>
  );
}
