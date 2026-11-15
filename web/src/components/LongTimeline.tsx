import type { TimeWindow, WiseFrame } from "../lib/bundle";
import { monthYear } from "../lib/format";

type Item = { wise: boolean; id: string };

type Props = {
  wise: WiseFrame[];
  visits: TimeWindow[];
  current?: Item;
  onSelect: (item: Item) => void;
  /** Kualitas data tiap kunjungan SPHEREx pada band yang tampil, dua baris pendek. */
  quality?: Record<string, string[]>;
  /** Keterangan untuk citra WISE: panjang gelombangnya, dan bahwa ia hanya untuk dilihat. */
  wiseNote?: string;
};

const PAD = 3; // persen
const year = (mjd: number) => 1858.874 + mjd / 365.25; // cukup teliti untuk meletakkan tanda tahun
const mjdOfYear = (y: number) => (y - 1858.874) * 365.25;

/** Penggaris 16 tahun: citra WISE lalu kunjungan SPHEREx, pada jarak tanggal yang sebenarnya. */
export function LongTimeline({ wise, visits, current, onSelect, quality, wiseNote }: Props) {
  const all = [
    ...wise.map((f) => ({ wise: true, id: f.id, mjd: f.mjd_mid })),
    ...visits.map((w) => ({ wise: false, id: w.id, mjd: w.mjd_mid })),
  ];
  const t0 = all[0].mjd;
  const span = Math.max(1, all[all.length - 1].mjd - t0);
  const at = (mjd: number) => PAD + ((mjd - t0) / span) * (100 - 2 * PAD);

  const years: number[] = [];
  for (let y = Math.ceil(year(t0)); mjdOfYear(y) <= t0 + span; y++) years.push(y);
  const lastWise = wise[wise.length - 1].mjd_mid;
  const firstVisit = visits[0]?.mjd_mid;

  return (
    <div className="timeline timeline-long" role="group" aria-label="Images from 2010 to now">
      <div className="timeline-rule" aria-hidden="true">
        {years.map((y) => (
          <i key={y} data-major={y % 5 === 0} style={{ left: `${at(mjdOfYear(y))}%` }}>
            {y % 5 === 0 && <span>{y}</span>}
          </i>
        ))}
      </div>
      <span className="era-tag" style={{ left: `${at(t0)}%` }} aria-hidden="true">
        WISE
      </span>
      {firstVisit !== undefined && (
        <span className="era-tag era-tag-end" style={{ right: `${100 - at(t0 + span)}%` }} aria-hidden="true">
          SPHEREx
        </span>
      )}
      {firstVisit !== undefined && (
        <i className="era-break" style={{ left: `${at((lastWise + firstVisit) / 2)}%` }} aria-hidden="true" />
      )}
      {all.map((f) => (
        <button
          key={`${f.wise ? "x" : "w"}${f.id}`}
          type="button"
          className="tick"
          data-kind={f.wise ? "wise" : "spherex"}
          style={{ left: `${at(f.mjd)}%` }}
          aria-pressed={!!current && current.wise === f.wise && current.id === f.id}
          aria-label={`${f.wise ? "WISE" : "SPHEREx"}, ${monthYear(f.mjd)}`}
          onClick={() => onSelect({ wise: f.wise, id: f.id })}
        >
          <span aria-hidden="true" />
          <i className="time-tip" data-edge={at(f.mjd) < 14 ? "start" : at(f.mjd) > 86 ? "end" : undefined} aria-hidden="true">
            <b>
              {monthYear(f.mjd)} · {f.wise ? "WISE" : "SPHEREx"}
            </b>
            {(f.wise ? (wiseNote ? [wiseNote] : []) : (quality?.[f.id] ?? [])).map((line) => (
              <em key={line}>{line}</em>
            ))}
          </i>
        </button>
      ))}
    </div>
  );
}
