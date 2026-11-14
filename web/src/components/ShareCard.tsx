import { DownloadSimple, LinkSimple, ShareNetwork, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CARD_H, CARD_TITLE, CARD_W, cardKinds, drawCard, type CardInput, type CardKind } from "../lib/card";
import { useDialog } from "../lib/hooks";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Bahan kartu dari yang sedang tampil; kosong selagi bahannya belum termuat. */
  input?: CardInput;
  lookName: string;
  /** Spektrum masih dimuat, jadi kartu cahaya belum bisa dinilai ada atau tidaknya. */
  spectrumPending: boolean;
  copied: boolean;
  onCopyLink: () => void;
};

const NUMERAL: Record<CardKind, string> = { wanderer: "I", voice: "II" };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sky";

/** Kartu berbagi: gambar yang dilukis dari data di layar, untuk disimpan atau dibagikan. */
export function ShareCard(p: Props) {
  const ref = useDialog<HTMLDivElement>(p.open, p.onClose);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wanted, setWanted] = useState<CardKind>("wanderer");
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const kinds = useMemo(() => (p.input ? cardKinds(p.input) : []), [p.input]);
  const kind = kinds.includes(wanted) ? wanted : kinds[0];

  // Lembar berbagi sistem hanya ditawarkan kalau ia memang menerima berkas gambar.
  const canShareFiles = useMemo(() => {
    try {
      const probe = new File([""], "card.png", { type: "image/png" });
      return typeof navigator.share === "function" && !!navigator.canShare?.({ files: [probe] });
    } catch {
      return false;
    }
  }, []);

  const { open, input } = p;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !input || !kind || !canvas) return;
    let alive = true;
    setDrawn(false);
    setFailed(false);
    drawCard(canvas, kind, input)
      .then(() => alive && setDrawn(true))
      .catch((err) => {
        console.error(err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, input, kind]);

  if (!p.open) return null;

  const fileName = `swara-${slug(p.input?.name ?? "")}-${kind === "voice" ? "light" : "motion"}.png`;
  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) resolve(null);
      else canvas.toBlob(resolve, "image/png");
    });

  const save = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const share = async () => {
    const blob = await toBlob();
    if (!blob || !p.input) return;
    const file = new File([blob], fileName, { type: "image/png" });
    try {
      await navigator.share({ files: [file], title: `${p.input.name} on SWARA`, text: `Look what I found in the sky: ${p.input.url}` });
    } catch (err) {
      // Dibatalkan pengguna bukan kegagalan; selain itu kartunya disimpan saja.
      if (!(err instanceof DOMException && err.name === "AbortError")) void save();
    }
  };

  const ready = drawn && !failed;

  return (
    <div
      className="scrim scrim-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div ref={ref} className="cardbox" role="dialog" aria-modal="true" aria-label="Draw a card of this place">
        <div className="cardbox-stage" data-ready={ready}>
          <canvas
            ref={canvasRef}
            className="cardbox-canvas"
            width={CARD_W}
            height={CARD_H}
            role="img"
            aria-label={
              p.input && kind
                ? `Share card for ${p.input.name}: ${CARD_TITLE[kind].toLowerCase()}, drawn from the data on screen.`
                : "Share card"
            }
          />
          {!ready && <p className="cardbox-wait">{failed ? "The card could not be drawn." : "Drawing the card…"}</p>}
        </div>

        <div className="cardbox-side">
          <div className="cardbox-head">
            <h2>Draw a card</h2>
            <button type="button" className="round" aria-label="Close" onClick={p.onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
          <p className="cardbox-lead">
            A card of this place, drawn from the data on screen. Every ray on it is a measurement, and it follows the
            look you chose: {p.lookName}.
          </p>

          {kinds.length > 1 && (
            <div className="cardbox-tabs" role="group" aria-label="Which card">
              {kinds.map((k) => (
                <button key={k} type="button" className="pill" aria-pressed={k === kind} onClick={() => setWanted(k)}>
                  <span className="cardbox-numeral" aria-hidden="true">
                    {NUMERAL[k]}
                  </span>
                  {CARD_TITLE[k]}
                </button>
              ))}
            </div>
          )}
          {kinds.length === 1 && (
            <p className="cardbox-note">
              {p.input?.blended
                ? "There is no card for its light here: it could not be separated from a background star in this data."
                : p.spectrumPending
                  ? "A second card, for its light, appears once the spectrum has loaded."
                  : "There is no card for its light here: the spectrum has too few clean measurements."}
            </p>
          )}

          <div className="cardbox-actions">
            {/* Tidak memakai `disabled`: tombol ini menerima fokus saat dialog terbuka, sebelum kartunya selesai dilukis. */}
            <button
              type="button"
              className="pill pill-accent"
              data-autofocus
              aria-disabled={!ready}
              onClick={() => ready && void save()}
            >
              <DownloadSimple aria-hidden="true" />
              Save card
            </button>
            {canShareFiles && (
              <button type="button" className="pill" disabled={!ready} onClick={() => void share()}>
                <ShareNetwork aria-hidden="true" />
                Share card
              </button>
            )}
            <button type="button" className="pill" onClick={p.onCopyLink}>
              <LinkSimple aria-hidden="true" />
              <span aria-live="polite">{p.copied ? "Link copied" : "Copy link"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
