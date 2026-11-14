import { X } from "@phosphor-icons/react";
import type { Frame, Manifest, TimeWindow } from "../lib/bundle";
import { coord, dayMonthYear, microns } from "../lib/format";
import { useDialog } from "../lib/hooks";

type Props = {
  open: boolean;
  onClose: () => void;
  manifest?: Manifest;
  win?: TimeWindow;
  frame?: Frame;
};

const KEYS: [string, string][] = [
  ["Space", "blink"],
  ["← →", "step through visits"],
  ["1 to 6", "image band"],
  ["Alt+G/K/P/S", "sound mode"],
  ["L", "listen to the spectrum"],
  ["M", "motion sound"],
  ["/", "go to a place"],
  ["N", "these notes"],
];

/** Laci catatan: semua yang benar tapi tidak perlu tampil terus. */
export function Notes({ open, onClose, manifest, win, frame }: Props) {
  const ref = useDialog<HTMLElement>(open, onClose);
  if (!open) return null;
  const ctx = manifest?.context;
  const ctxBand = manifest?.bands.find((b) => b.id === ctx?.band);

  return (
    <div
      className="scrim scrim-side"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside ref={ref} className="notes" role="dialog" aria-modal="true" aria-label="Notes on this view">
        <header className="notes-head">
          <h2>Notes</h2>
          <button type="button" className="round" aria-label="Close" data-autofocus onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {manifest && win && frame && (
          <section>
            <h3>In the lens</h3>
            <dl className="facts">
              <dt>Visit</dt>
              <dd>
                {dayMonthYear(win.date_start)} to {dayMonthYear(win.date_end)}
              </dd>
              <dt>Image</dt>
              <dd>Median of {frame.n_exposures} exposures</dd>
              <dt>Field</dt>
              <dd>{manifest.fov_arcsec / 60}′ across, north up, east left</dd>
              <dt>Centre</dt>
              <dd>{coord(manifest.ra, manifest.dec)}</dd>
              <dt>Data</dt>
              <dd>{manifest.source.n_exposures_used} SPHEREx exposures in all</dd>
            </dl>
            <p>
              The amber cross marks where the object was on the first visit. The dots are its measured position on
              each visit.
            </p>
          </section>
        )}

        <section>
          <h3>Around the lens</h3>
          <p>
            {ctx
              ? `The sky behind is real too: a SPHEREx view ${ctx.fov_arcsec / 60}′ across of the same place${
                  ctxBand ? `, at ${microns(ctxBand.lambda_min, ctxBand.lambda_max)}` : ""
                }, from ${ctx.n_exposures} exposures. It is dimmed and only there to show the surroundings. Nothing is measured from it.`
              : "This place has no wide view yet, so the lens floats in empty space."}
          </p>
        </section>

        <section>
          <h3>Unreliable pixels</h3>
          <ul className="legend">
            <li>
              <i className="sw sw-sat" /> Saturated: the source is too bright
            </li>
            <li>
              <i className="sw sw-bad" /> Bad or missing detector pixel
            </li>
          </ul>
          <p>Switch the marks on with the flag button on the lens ring.</p>
        </section>

        <section>
          <h3>Reading the spectrum</h3>
          <p>
            The same light, split by wavelength from 0.75 to 5 µm. Its shape is a fingerprint of what kind of object
            this is. The six blocks under it are the six image bands: pick one to see the object in that light.
          </p>
          <ul className="legend">
            <li>
              <i className="key key-dot" /> this visit
            </li>
            <li>
              <i className="key key-line" /> other visits
            </li>
            <li>
              <i className="key key-ring" /> flagged saturated, value not verified
            </li>
            <li>
              <i className="key key-tick" /> measured but unusable
            </li>
          </ul>
        </section>

        <section>
          <h3>What you hear</h3>
          <p>
            Listen plays one visit from short to long wavelength, left to right. Higher pitch is brighter, a rougher
            tone is a value flagged as saturated, and a soft tick is a gap in the data. The lens follows the band
            being played.
          </p>
          <p>
            Motion sound plays one note per visit while blinking. Higher is further north, lower is further south,
            and the note moves left or right with the picture. The same note means no measurable shift.
          </p>
          <p>
            Four sound modes answer four questions by ear: Motion (where did it move), Brightness (dimmer or
            brighter), Scan (which part of the picture is bright), and Spectrum (what light does it give off).
            Switching modes plays that mode&apos;s earcon and its lowest-to-highest tones, and the meaning is also
            announced as text.
          </p>
        </section>

        <section>
          <h3>Keys</h3>
          <dl className="facts keys">
            {KEYS.map(([key, what]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3>Source</h3>
          <p>
            SPHEREx all-sky infrared survey, level 2 images from the NASA/IPAC Infrared Science Archive. Names and
            catalogue motions come from SIMBAD.
          </p>
        </section>
      </aside>
    </div>
  );
}
