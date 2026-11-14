// Meter terang + banding A/B untuk Mode Kecerahan. Meter mengikuti kunjungan
// yang sedang terdengar; A/B membunyikan dua kunjungan bergantian.

import { microns } from "../lib/format";
import type { BrightnessAnalysis } from "../sound/sonify";

type Props = {
  analysis: BrightnessAnalysis;
  /** Kunjungan yang sedang terdengar (kunjungan aktif, atau sisi A/B). */
  soundingId?: string;
  abOn: boolean;
  abSide: "A" | "B";
  canAB: boolean;
  onToggleAB: () => void;
};

export function BrightnessTools(p: Props) {
  const { analysis, soundingId } = p;
  const meds = analysis.visits.flatMap((v) => (v.median === null ? [] : [v.median]));
  const lo = meds.length ? Math.min(...meds) : 0;
  const hi = meds.length ? Math.max(...meds) : 1;
  const cur = analysis.visits.find((v) => v.window === soundingId);
  const fill = cur?.median === null || cur?.median === undefined ? 0 : ((cur.median - lo) / Math.max(hi - lo, 1e-12)) * 100;

  let caption: string;
  if (!analysis.band) caption = "no shared band across visits";
  else if (!cur || cur.median === null) caption = `${analysis.band.id} missing this visit`;
  else if (cur.still) caption = "same as reference — no measurable change";
  else caption = `${cur.rel !== null && cur.rel >= 0 ? "+" : ""}${((cur.rel ?? 0) * 100).toFixed(0)}% vs reference`;

  return (
    <div className="bright">
      <div className="meter" role="img" aria-label={`Brightness meter: ${caption}`}>
        <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, fill))}%` }} aria-hidden="true" />
      </div>
      <span className="meter-cap" aria-hidden="true">
        {p.abOn ? `${p.abSide} · ` : ""}
        {analysis.band ? `${analysis.band.id} ${microns(analysis.band.lambda_min, analysis.band.lambda_max)} · ` : ""}
        {caption}
      </span>
      <button
        type="button"
        className="pill"
        aria-pressed={p.abOn}
        disabled={!p.canAB && !p.abOn}
        title={p.abOn ? "Stop alternating A and B" : "Alternate the reference visit and this one"}
        onClick={p.onToggleAB}
      >
        {p.abOn ? `A/B: ${p.abSide}` : "A/B"}
      </button>
    </div>
  );
}
