import { useId, useState, type FormEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  error?: string;
  onSubmit: (query: string) => void;
};

/** Satu kotak untuk nama benda atau RA dan Dec; teksnya dibaca di server. */
export function SearchForm({ value, onChange, busy, error, onSubmit }: Props) {
  const [help, setHelp] = useState(false);
  const helpId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <form className="coords" onSubmit={submit} role="search" aria-label="Find a place in the sky">
      <label className="field">
        <span className="sr-only">Object name, or RA and Dec</span>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.2" />
          <path d="m10.2 10.2 3.3 3.3" />
        </svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Object name, or RA and Dec"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={80}
          required
        />
      </label>
      <button type="submit" className="btn" disabled={busy}>
        Show sky
      </button>
      <button
        type="button"
        className="btn btn-icon btn-toggle"
        aria-label="What can I type here?"
        aria-expanded={help}
        aria-controls={helpId}
        aria-pressed={help}
        onClick={() => setHelp((v) => !v)}
      >
        ?
      </button>
      {error && (
        <p className="coords-error" role="alert">
          {error}
        </p>
      )}
      {help && (
        <div className="coords-help" id={helpId}>
          <p>
            Type a name astronomers use, such as <b>Wolf 359</b>. It is looked up in the SIMBAD catalogue and moved to
            where the object is in 2026.
          </p>
          <p>
            Or type a position. <b>RA</b> and <b>Dec</b> are the sky's longitude and latitude: RA runs from 0 to 360°
            (or 0 to 24 hours), Dec from −90° to +90°.
          </p>
          <p className="coords-examples">
            269.4463 +4.7682
            <br />
            17h57m47s +4d46m06s
          </p>
        </div>
      )}
    </form>
  );
}
