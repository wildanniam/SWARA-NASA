import { useState, type FormEvent } from "react";

type Props = {
  busy: boolean;
  error?: string;
  onSubmit: (ra: string, dec: string) => void;
};

/** RA dan Dec dalam derajat atau jam-menit-detik; teksnya dibaca di server. */
export function CoordinateForm({ busy, error, onSubmit }: Props) {
  const [ra, setRa] = useState("");
  const [dec, setDec] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ra.trim() && dec.trim()) onSubmit(ra.trim(), dec.trim());
  };

  return (
    <form className="coords" onSubmit={submit} aria-label="Go to sky coordinates">
      <label className="field">
        <span>RA</span>
        <input
          value={ra}
          onChange={(e) => setRa(e.target.value)}
          placeholder="269.4463 or 17h57m47s"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
        />
      </label>
      <label className="field">
        <span>Dec</span>
        <input
          value={dec}
          onChange={(e) => setDec(e.target.value)}
          placeholder="+4.7682 or +4d46m06s"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
        />
      </label>
      <button type="submit" className="btn" disabled={busy}>
        Show sky
      </button>
      {error && (
        <p className="coords-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
