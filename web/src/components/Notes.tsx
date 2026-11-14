import { X } from "@phosphor-icons/react";
import type { Frame, Manifest, TimeWindow, WiseFrame } from "../lib/bundle";
import { lookGradient, LOOKS, type PaletteId } from "../lib/palette";
import { coord, dayMonthYear, microns } from "../lib/format";
import { useDialog } from "../lib/hooks";

type Props = {
  open: boolean;
  onClose: () => void;
  manifest?: Manifest;
  win?: TimeWindow;
  frame?: Frame;
  /** Citra WISE yang sedang tampil di lensa, kalau ada. */
  wiseFrame?: WiseFrame;
  /** Look yang sedang dipakai, untuk legenda terangnya. */
  look: PaletteId;
};

const KEYS: [string, string][] = [
  ["Space", "blink"],
  ["← →", "step through visits"],
  ["1 to 6", "image band"],
  ["+ −", "zoom the lens, out to the wide view"],
  ["C", "next look"],
  ["R", "reveal faint things"],
  ["L", "listen to image, spectrum, and motion together"],
  ["/", "go to a place"],
  ["G", "this guide"],
];

/** Laci catatan: semua yang benar tapi tidak perlu tampil terus. */
export function Notes({ open, onClose, manifest, win, frame, wiseFrame, look }: Props) {
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
      <aside ref={ref} className="notes" role="dialog" aria-modal="true" aria-label="Guide to this view">
        <header className="notes-head">
          <h2>Guide</h2>
          <button type="button" className="round" aria-label="Close" data-autofocus onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <section>
          <h3>Reading the lens</h3>
          <ul className="guide-rows">
            <li>
              <svg viewBox="-14 -14 28 28" aria-hidden="true">
                <path className="g-mark" d="M-11 0H-4M4 0H11M0 -11V-4M0 4V11" />
              </svg>
              <span>
                <b>The mark</b> is where the object was at the first SPHEREx visit. It stays fixed on the sky, so
                anything that leaves it has moved.
              </span>
            </li>
            <li>
              <svg viewBox="-14 -14 28 28" aria-hidden="true">
                <path className="g-trail" d="M-9 7L0 1L9 -7" />
                <circle className="g-dot" cx="0" cy="1" r="2.6" />
                <circle className="g-dot g-dot-now" cx="9" cy="-7" r="2.6" />
              </svg>
              <span>
                <b>The dots</b> are the position measured at each later visit. The filled one is the visit on
                screen.
              </span>
            </li>
            <li>
              <svg viewBox="-14 -14 28 28" aria-hidden="true">
                <circle className="g-ring" r="10" />
                <path className="g-ring" d="M0 -10V-13M-10 0H-13" />
                <path className="g-arc" d="M0 -10A10 10 0 0 1 10 0" />
              </svg>
              <span>
                <b>The ring</b> has north at the top and east on the left. It fills while data is read and sweeps
                while the spectrum plays.
              </span>
            </li>
            <li>
              <i className="g-ramp" style={{ background: lookGradient(look) }} aria-hidden="true" />
              <span>
                <b>The colours</b> ({LOOKS.find((l) => l.id === look)?.name}) run from faint to bright. Every look
                keeps that order, so a look changes the mood, never which thing is brighter.
              </span>
            </li>
            <li>
              <svg viewBox="-14 -14 28 28" aria-hidden="true">
                <circle className="g-reticle" r="7" />
                <path className="g-reticle" d="M0 -7V-11M0 7V11M-7 0H-11M7 0H11" />
              </svg>
              <span>
                <b>Zoom out</b> past the widest level and the lens closes onto the sky behind it, which is the
                same place seen wider. Select the ring to look closer again.
              </span>
            </li>
          </ul>
        </section>

        {manifest && wiseFrame && (
          <section>
            <h3>In the lens</h3>
            <dl className="facts">
              <dt>Epoch</dt>
              <dd>
                {dayMonthYear(wiseFrame.date_start)} to {dayMonthYear(wiseFrame.date_end)}
              </dd>
              <dt>Image</dt>
              <dd>WISE W2 (4.6 µm), unWISE coadd, 2.75″ pixels</dd>
              <dt>Use</dt>
              <dd>For viewing. Positions and brightness are measured on SPHEREx only.</dd>
              <dt>Display</dt>
              <dd>Stretched by the same rule as the SPHEREx images and softened to their sharpness</dd>
              <dt>Centre</dt>
              <dd>{coord(manifest.ra, manifest.dec)}</dd>
            </dl>
          </section>
        )}

        {manifest && win && frame && !wiseFrame && (
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
                }, from ${ctx.n_exposures} exposures. It is centred exactly under the lens, so the lens is a magnified part of it: zoom all the way out and the lens closes onto the same stars. The wide view is one band and has no dates, and nothing is measured from it.`
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
            Listen layers the image, spectrum, and measured motion on one visit clock. The image moves through 32
            columns from east to west: higher is further north, louder is brighter, and a short ping marks the
            target at the centre. The spectrum follows 48 wavelengths from short to long, with higher pitch for
            brighter measurements and a soft tick for a data gap. Motion adds a brief bell at each measured visit.
            The image uses percussive notes, the spectrum a smooth flute-like tone, and motion a bell-like tone.
            Missing layers or visits are skipped and announced; the scan line, wavelength cursor, and lens follow
            the same clock.
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
          <p>
            Images from 2010 to 2024 are from NASA's WISE and NEOWISE missions: unWISE time-resolved coadds, served
            by WiseView from the Backyard Worlds: Planet 9 project.
          </p>
        </section>
      </aside>
    </div>
  );
}
