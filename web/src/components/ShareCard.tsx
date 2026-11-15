import { ArrowUpRight, DownloadSimple, LinkSimple, ShareNetwork, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CARD_H, CARD_TITLE, CARD_W, cardKinds, drawCard, SKINS, type CardInput, type CardKind, type RGB } from "../lib/card";
import { cardUrl, KIND_SLUG } from "../lib/cardData";
import { useDialog } from "../lib/hooks";
import type { PaletteId } from "../lib/palette";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Bahan kartu dari yang sedang tampil; kosong selagi bahannya belum termuat. */
  input?: CardInput;
  /** Look yang dipakai; dialog pembungkusnya ikut berwarna sama dengan kartunya. */
  look: PaletteId;
  lookName: string;
  /** Spektrum masih dimuat, jadi kartu cahaya belum bisa dinilai ada atau tidaknya. */
  spectrumPending: boolean;
};

const NUMERAL = ["I", "II", "III"];

/** Warna dialog dari skin kartu look itu: aksen, tinta di atas aksen, dan rona pelat.
 *  Paper kartunya terang, sedangkan dialognya tetap gelap, jadi memakai warna Ember. */
function dialogColors(look: PaletteId): CSSProperties {
  const sk = SKINS[look === "paper" ? "heat" : look];
  const c = (v: RGB) => v.join(" ");
  const hex = (v: RGB) => v.map((n) => n.toString(16).padStart(2, "0")).join("");
  const star = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%23${hex(sk.gold)}' d='M10 0l2 8 8 2-8 2-2 8-2-8-8-2 8-2z'/%3E%3C/svg%3E")`;
  return { "--k-gold": c(sk.gold), "--k-ink": c(sk.ink), "--k-top": c(sk.top), "--k-bottom": c(sk.bottom), "--k-star": star } as CSSProperties;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sky";

/** Kartu berbagi: gambar yang dilukis dari data di layar. Yang dibagikan adalah tautan ke
 *  halaman kartu itu (/card); gambarnya sendiri bisa disimpan, ukuran story. */
export function ShareCard(p: Props) {
  const ref = useDialog<HTMLDivElement>(p.open, p.onClose);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wanted, setWanted] = useState<CardKind>("wanderer");
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const kinds = useMemo(() => (p.input ? cardKinds(p.input) : []), [p.input]);
  const kind = kinds.includes(wanted) ? wanted : kinds[0];

  // Di ponsel tautannya diserahkan ke lembar berbagi sistem; di tempat lain disalin.
  // Hanya tautan yang dikirim, tanpa berkas: lembar berbagi desktop menyalin berkas gambar
  // dua kali beserta jalur berkasnya.
  const nativeShare = useMemo(
    () => typeof navigator.share === "function" && !!window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );

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

  const fileName = `swara-${slug(p.input?.name ?? "")}-${kind ? KIND_SLUG[kind] : "card"}.png`;
  const link = p.input && kind ? cardUrl(p.input.url, kind, p.input.look) : undefined;
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

  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };
  const share = () => {
    if (!link || !p.input) return;
    if (!nativeShare) return copy();
    navigator.share({ title: `${p.input.name}: a card from the sky`, url: link }).catch((err: unknown) => {
      // Dibatalkan pengguna bukan kegagalan; selain itu tautannya disalin saja.
      if (!(err instanceof DOMException && err.name === "AbortError")) copy();
    });
  };

  const ready = drawn && !failed;

  return (
    <div
      className="scrim scrim-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div ref={ref} className="cardbox" style={dialogColors(p.look)} role="dialog" aria-modal="true" aria-label="Draw a card of this place">
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
            look you chose: {p.lookName}. The link opens this card on a page of its own.
          </p>

          {kinds.length > 1 && (
            <div className="cardbox-tabs" role="group" aria-label="Which card">
              {kinds.map((k, i) => (
                <button key={k} type="button" className="pill" aria-pressed={k === kind} onClick={() => setWanted(k)}>
                  <span className="cardbox-numeral" aria-hidden="true">
                    {NUMERAL[i]}
                  </span>
                  {CARD_TITLE[k]}
                </button>
              ))}
            </div>
          )}
          {kinds.length > 0 && !kinds.includes("voice") && (
            <p className="cardbox-note">
              {p.input?.blended
                ? "There is no card for its light here: it could not be separated from a background star in this data."
                : p.spectrumPending
                  ? "A card for its light appears once the spectrum has loaded."
                  : "There is no card for its light here: the spectrum has too few clean measurements."}
            </p>
          )}

          <div className="cardbox-actions">
            {/* Tidak memakai `disabled`: tombol ini menerima fokus saat dialog terbuka, sebelum kartunya selesai dilukis. */}
            <button type="button" className="pill pill-accent" data-autofocus aria-disabled={!link} onClick={share}>
              {nativeShare ? <ShareNetwork aria-hidden="true" /> : <LinkSimple aria-hidden="true" />}
              <span aria-live="polite">{copied ? "Link copied" : nativeShare ? "Share this card" : "Copy card link"}</span>
            </button>
            <button type="button" className="pill" aria-disabled={!ready} onClick={() => ready && void save()}>
              <DownloadSimple aria-hidden="true" />
              Save image for stories
            </button>
            {link && (
              <a className="cardbox-open" href={link} target="_blank" rel="noreferrer">
                See the card page
                <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
