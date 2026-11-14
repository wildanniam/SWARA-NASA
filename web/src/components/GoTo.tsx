import { ArrowRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { KIND_LABEL } from "../content";
import { assetUrl, defaultBand, findFrame, loadManifest, type Manifest, type TargetRef } from "../lib/bundle";
import { coord } from "../lib/format";
import { useDialog } from "../lib/hooks";
import { paint } from "../lib/paint";
import { LUTS } from "../lib/palette";

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
};

const manifests = new Map<string, Promise<Manifest>>();

/** Cuplikan bundar dari citra asli benda itu: kunjungan pertama di band bawaannya. */
function Thumb({ target, enabled }: { target: TargetRef; enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);
  const custom = target.kind === "custom";

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const key = `${custom ? "api" : "preset"}:${target.id}`;
    let pending = manifests.get(key);
    if (!pending) {
      pending = loadManifest(target.id, custom);
      manifests.set(key, pending);
      pending.catch(() => manifests.delete(key));
    }
    pending
      .then((m) => {
        const band = defaultBand(m);
        const frame = m.windows.map((w) => findFrame(m, w.id, band)).find(Boolean);
        if (!frame || !alive) return;
        const img = new Image();
        img.onload = () => {
          if (!alive || !ref.current) return;
          paint(ref.current, img, LUTS.heat, 96);
          setShown(true);
        };
        img.src = assetUrl(target.id, custom, frame.image);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [target.id, custom, enabled]);

  return <canvas ref={ref} className="thumb" data-shown={shown} width={96} height={96} aria-hidden="true" />;
}

/** Pintu masuk: satu kotak untuk nama benda atau koordinat, lalu tempat yang bisa langsung dituju. */
export function GoTo(p: Props) {
  const ref = useDialog<HTMLDivElement>(p.open, p.onClose);
  const [help, setHelp] = useState(false);
  if (!p.open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (p.query.trim() && !p.busy) p.onSubmit(p.query.trim());
  };

  const row = (t: TargetRef, detail: string) => (
    <li key={t.id}>
      <button type="button" className="place" aria-current={t.id === p.currentId} onClick={() => p.onPick(t.id)}>
        <Thumb target={t} enabled={!p.building.has(t.id)} />
        <span className="place-name">{t.name}</span>
        <span className="place-detail">{detail}</span>
        <ArrowRight aria-hidden="true" />
      </button>
    </li>
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
          Try a name like <b>Wolf 359</b>, or a position like <span className="mono">269.4463 +4.7682</span>.{" "}
          <button type="button" className="link" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
            What are RA and Dec?
          </button>
        </p>
        {help && (
          <p className="goto-explain">
            They are the sky's longitude and latitude. RA runs from 0 to 360° (or 0 to 24 hours), Dec from −90° to
            +90°. A name is looked up in the SIMBAD catalogue and moved to where the object is in 2026.
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
