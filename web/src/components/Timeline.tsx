import type { TimeWindow } from "../lib/bundle";
import { monthYear } from "../lib/format";

type Props = {
  windows: TimeWindow[];
  available: Set<string>;
  current: string;
  onSelect: (id: string) => void;
};

/** Sumbu waktu nyata: jarak antar kunjungan mengikuti tanggalnya. */
export function Timeline({ windows, available, current, onSelect }: Props) {
  const t0 = windows[0].mjd_mid;
  const span = Math.max(1, windows[windows.length - 1].mjd_mid - t0);
  return (
    <div className="timeline" role="group" aria-label="Visits">
      <div className="timeline-track" aria-hidden="true" />
      {windows.map((w) => {
        const ok = available.has(w.id);
        const left = 9 + ((w.mjd_mid - t0) / span) * 82;
        return (
          <button
            key={w.id}
            type="button"
            className="visit"
            style={{ left: `${left}%` }}
            aria-pressed={w.id === current}
            disabled={!ok}
            title={ok ? undefined : "No image in this band for this visit"}
            onClick={() => onSelect(w.id)}
          >
            <span className="visit-dot" aria-hidden="true" />
            <span className="visit-label">{monthYear(w.mjd_mid)}</span>
          </button>
        );
      })}
    </div>
  );
}
