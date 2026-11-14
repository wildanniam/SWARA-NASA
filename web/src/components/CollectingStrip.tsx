import { Play } from "@phosphor-icons/react";
import type { Band } from "../lib/bundle";
import { useWidth } from "../lib/hooks";
import { LAMBDA_MAX, LAMBDA_MIN } from "../lib/spectrum";

type Props = {
  bands: Band[];
  /** Panjang gelombang (mikron) tiap eksposur yang sudah terbaca. */
  seen: number[];
  done: number;
  total: number;
  /** Tahap pembuatan bundle yang sedang berjalan di server. */
  stage: string;
};

const H = 84;
const M = { left: 2, right: 2, top: 12, bottom: 18 };
const TICKS = [1, 2, 3, 4, 5];

/** Pita spektrum selagi eksposur masih dikumpulkan. Tiap eksposur SPHEREx mengamati
 *  target di satu panjang gelombang, jadi tiap yang terbaca menambah satu garis di
 *  tempatnya: spektrum terlihat terisi sebelum fluksnya diukur. */
export function CollectingStrip({ bands, seen, done, total, stage }: Props) {
  const [plotRef, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 240);
  const xOf = (lambda: number) =>
    M.left + Math.min(1, Math.max(0, (lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN))) * (W - M.left - M.right);
  const baseline = H - M.bottom;
  const label =
    stage === "fetch" && total
      ? `Reading SPHEREx exposures, ${done} of ${total}. Each one adds a wavelength.`
      : done
        ? "All exposures read. Aligning the images and measuring."
        : "Looking for SPHEREx exposures of this spot.";

  return (
    <>
      <div className="dock-lead">
        <button type="button" className="dial" disabled aria-label="The spectrum is still being collected">
          <Play weight="fill" />
        </button>
        <span className="dial-caption">Listen</span>
      </div>

      <div className="strip">
        <div ref={plotRef} className="strip-plot">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
            <line className="spec-axis" x1={M.left} y1={baseline} x2={W - M.right} y2={baseline} />
            {bands.slice(1).map((b) => (
              <line key={b.id} className="spec-band-edge" x1={xOf(b.lambda_min)} y1={M.top} x2={xOf(b.lambda_min)} y2={baseline} />
            ))}
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
            {seen.map((lambda, i) => (
              <line key={i} className="spec-seen" x1={xOf(lambda)} y1={baseline - 16} x2={xOf(lambda)} y2={baseline} />
            ))}
          </svg>
          <p className="strip-message strip-collecting">{label}</p>
        </div>
      </div>

      <div className="dock-tail">
        <span className="collect-count" aria-hidden="true">
          {total ? `${done} / ${total}` : ""}
        </span>
      </div>
    </>
  );
}
