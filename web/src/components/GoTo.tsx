import { ArrowRight, Crosshair, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { atlasUrl, constellationAt, decDms, raHms, readCoordinates, readDec, readRa, toMap, type Atlas } from "../lib/allsky";
import { KIND_LABEL } from "../content";
import type { TargetRef } from "../lib/bundle";
import { coord } from "../lib/format";
import { useDialog } from "../lib/hooks";
import { LUTS, type PaletteId } from "../lib/palette";
import { loadGray, paintSky } from "../lib/skyimage";
import { PlaceThumb, useVerdict } from "./PlaceThumb";

type Props = {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (value: string) => void;
  busy: boolean;
  error?: string;
  onSubmit: (query: string) => void;
  examples: TargetRef[];
  yours: TargetRef[];
  /** Tempat yang bundelnya belum jadi: belum ada citra untuk cuplikan. */
  building: Set<string>;
  currentId?: string;
  onPick: (id: string) => void;
  /** Peta seluruh langit, untuk menunjukkan di mana koordinat yang diketik berada. */
  atlas?: Atlas;
  look: PaletteId;
};

/** Di mana koordinat yang sedang diketik berada di langit, sebelum dikirim. */
function ReadAs({ atlas, look, ra, dec }: { atlas: Atlas; look: PaletteId; ra: number; dec: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frame = atlas.frames.find((f) => f.band === atlas.default_band) ?? atlas.frames[0];
    let alive = true;
    loadGray(atlasUrl(frame.small))
      .then((gray) => alive && ref.current && paintSky(ref.current, gray, LUTS[look]))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [atlas, look]);
  const p = toMap(atlas, ra, dec);
  const x = (p.x / atlas.projection.width) * 100;
  const y = (p.y / atlas.projection.height) * 100;
  const where = atlas.constellations.names[constellationAt(atlas, ra, dec)];
  return (
    <div className="readas" role="status">
      <div className="readas-map" aria-hidden="true">
        <canvas ref={ref} />
        <span className="readas-mark" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
      <p>
        <span className="readas-label">Read as</span>
        <span className="mono">
          RA {raHms(ra)}
          <br />
          Dec {decDms(dec)}
        </span>
        {where && <span className="readas-where">In {where}</span>}
      </p>
    </div>
  );
}

/** Satu tempat di daftar: jendela melengkung, nama dan julukannya, lalu yang terukur di sana. */
function PlaceRow({ t, detail, current, built, onPick }: { t: TargetRef; detail: string; current: boolean; built: boolean; onPick: (id: string) => void }) {
  const custom = t.kind === "custom";
  const v = useVerdict(t.id, custom, built);
  return (
    <li>
      <button type="button" className="place" aria-current={current} onClick={() => onPick(t.id)}>
        <PlaceThumb id={t.id} custom={custom} enabled={built} size={104} arch />
        <span className="place-id">
          <span className="place-name">{t.name}</span>
          <span className="place-epithet">{v?.epithet ?? detail}</span>
        </span>
        <span className="place-detail">{v ? v.short : built ? "" : "Still being gathered"}</span>
        <ArrowRight aria-hidden="true" />
      </button>
    </li>
  );
}

/** Pintu masuk: satu kotak untuk nama benda atau koordinat, lalu tempat yang bisa langsung dituju. */
export function GoTo(p: Props) {
  const ref = useDialog<HTMLDivElement>(p.open, p.onClose);
  const [help, setHelp] = useState(false);
  // Dua isian koordinat: RA dan Dec ditulis sendiri-sendiri, di samping kotak cari.
  const [raText, setRaText] = useState("");
  const [decText, setDecText] = useState("");
  if (!p.open) return null;

  const ra = readRa(raText);
  const dec = readDec(decText);
  const pointed = ra && "value" in ra && dec && "value" in dec ? { ra: ra.value, dec: dec.value } : undefined;
  const fieldError = (ra && "error" in ra && ra.error) || (dec && "error" in dec && dec.error) || undefined;
  const point = (e: FormEvent) => {
    e.preventDefault();
    // Dikirim sebagai dua angka derajat, bentuk yang dibaca server tanpa tafsir.
    if (pointed && !p.busy) p.onSubmit(`${pointed.ra.toFixed(5)} ${pointed.dec.toFixed(5)}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (p.query.trim() && !p.busy) p.onSubmit(p.query.trim());
  };

  const row = (t: TargetRef, detail: string) => (
    <PlaceRow key={t.id} t={t} detail={detail} current={t.id === p.currentId} built={!p.building.has(t.id)} onPick={p.onPick} />
  );

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div ref={ref} className="goto" role="dialog" aria-modal="true" aria-label="Go to a place in the sky">
        <form className="goto-form" onSubmit={submit} role="search">
          <label className="goto-field">
            <span className="sr-only">Object name, or RA and Dec</span>
            <MagnifyingGlass aria-hidden="true" />
            <input
              data-autofocus
              value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              placeholder="Object name, or RA and Dec"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={80}
            />
          </label>
          <button type="submit" className="pill pill-accent" disabled={p.busy || !p.query.trim()}>
            {p.busy ? "Looking" : "Go"}
          </button>
          <button type="button" className="round" aria-label="Close" onClick={p.onClose}>
            <X aria-hidden="true" />
          </button>
        </form>

        {p.error && (
          <p className="goto-error" role="alert">
            {p.error}
          </p>
        )}

        <p className="goto-hint">
          Try a name like <b>Wolf 359</b>. It is looked up in the SIMBAD catalogue and moved to where the object is in
          2026.
        </p>

        <form className="coords" onSubmit={point} aria-label="Go to coordinates">
          <p className="coords-or">
            <span>or set the telescope by coordinates</span>
          </p>
          <label className="coord">
            <span className="coord-name">
              <b>RA</b> Right ascension
            </span>
            <input
              value={raText}
              onChange={(e) => setRaText(e.target.value)}
              placeholder="17h 57m 48s"
              aria-invalid={!!ra && "error" in ra}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={24}
            />
            <span className="coord-hint">degrees, or hours h m s</span>
          </label>
          <label className="coord">
            <span className="coord-name">
              <b>Dec</b> Declination
            </span>
            <input
              value={decText}
              onChange={(e) => setDecText(e.target.value)}
              placeholder="+04° 46′ 06″"
              aria-invalid={!!dec && "error" in dec}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={24}
            />
            <span className="coord-hint">degrees, −90 to +90</span>
          </label>
          <button type="submit" className="pill pill-share" disabled={p.busy || !pointed}>
            <Crosshair aria-hidden="true" />
            Point
          </button>
        </form>
        {fieldError && (
          <p className="goto-error" role="status">
            {fieldError}
          </p>
        )}

        {(() => {
          // Pratinjau "dibaca sebagai": dari dua isian kalau keduanya terbaca, selain itu dari kotak cari.
          const reading = pointed ?? readCoordinates(p.query);
          if (!reading) return null;
          if ("error" in reading)
            return p.error ? null : (
              <p className="goto-error" role="status">
                {reading.error}
              </p>
            );
          return p.atlas ? <ReadAs atlas={p.atlas} look={p.look} ra={reading.ra} dec={reading.dec} /> : null;
        })()}

        <p className="goto-hint">
          <button type="button" className="link" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
            What are RA and Dec?
          </button>
        </p>
        {help && (
          <p className="goto-explain">
            They are the sky's longitude and latitude. RA runs from 0 to 360° (or 0 to 24 hours), Dec from −90° to
            +90°. The search box above also reads both at once, like <span className="mono">269.4463 +4.7682</span>.
          </p>
        )}

        <div className="goto-lists">
          {p.yours.length > 0 && (
            <section>
              <h2>Yours</h2>
              <ul>{p.yours.map((t) => row(t, coord(t.ra, t.dec)))}</ul>
            </section>
          )}
          <section>
            <h2>Examples</h2>
            <ul>{p.examples.map((t) => row(t, KIND_LABEL[t.kind]))}</ul>
          </section>
        </div>
      </div>
    </div>
  );
}
