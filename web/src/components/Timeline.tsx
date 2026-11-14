import type { TimeWindow } from "../lib/bundle";
import { monthYear } from "../lib/format";

type Props = {
  windows: TimeWindow[];
  available: Set<string>;
  current: string;
  /** Teks pendek di bawah tiap kunjungan: pergeseran terukur pada kunjungan itu. */
  notes: Record<string, string>;
  onSelect: (id: string) => void;
};

const PAD = 7; // persen, supaya label kunjungan pertama dan terakhir tidak terpotong

/** Penggaris waktu: jarak antar kunjungan mengikuti tanggalnya, dengan tanda tiap bulan. */
export function Timeline({ windows, available, current, notes, onSelect }: Props) {
  const t0 = windows[0].mjd_mid;
  const span = Math.max(1, windows[windows.length - 1].mjd_mid - t0);
  const at = (mjd: number) => PAD + ((mjd - t0) / span) * (100 - 2 * PAD);

  // Tanda tiap awal bulan di antara kunjungan pertama dan terakhir.
  const months: number[] = [];
  const d = new Date((t0 - 40587) * 86400000);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 60; i++) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const mjd = d.getTime() / 86400000 + 40587;
    if (mjd > t0 + span) break;
    months.push(mjd);
  }

  return (
    <div className="timeline" role="group" aria-label="Visits">
      <div className="timeline-rule" aria-hidden="true">
        {months.map((m) => (
          <i key={m} style={{ left: `${at(m)}%` }} />
        ))}
      </div>
      {windows.map((w) => {
        const ok = available.has(w.id);
        return (
          <button
            key={w.id}
            type="button"
            className="visit"
            style={{ left: `${at(w.mjd_mid)}%` }}
            aria-pressed={w.id === current}
            disabled={!ok}
            title={ok ? undefined : "No image in this band for this visit"}
            onClick={() => onSelect(w.id)}
          >
            <span className="visit-node" aria-hidden="true" />
            <span className="visit-date">
              {monthYear(w.mjd_mid).slice(0, 4)}
              <span className="yr-long">{monthYear(w.mjd_mid).slice(4)}</span>
              <span className="yr-short">'{monthYear(w.mjd_mid).slice(-2)}</span>
            </span>
            <span className="visit-note">{notes[w.id] ?? ""}</span>
          </button>
        );
      })}
    </div>
  );
}
