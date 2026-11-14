import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/hooks";
import { paint } from "../lib/paint";
import { STAR_LUT } from "../lib/palette";

type Props = {
  /** Tempat yang sedang dituju; berganti begitu pengguna memilih, sebelum citranya siap. */
  id?: string;
  /** Citra medan lebar tempat itu, begitu diketahui. */
  url?: string;
  size?: number;
  /** Arah pindah di langit dari tempat sebelumnya: x ke timur, y ke utara, panjang 1. */
  bearing: { x: number; y: number };
};

type Layer = { id: string; url: string; bearing: { x: number; y: number } };

/** Latar langit: citra SPHEREx medan lebar yang memenuhi layar. Saat tempat
 *  berganti, latar lama bergeser pergi searah gerak teleskop dan latar baru
 *  datang dari arah sebaliknya. */
export function Backdrop({ id, url, size = 720, bearing }: Props) {
  const [leaving, setLeaving] = useState<Layer>();
  const last = useRef<{ id?: string; url?: string }>({});

  useEffect(() => {
    const was = last.current;
    if (was.id && was.url && was.id !== id && !prefersReducedMotion()) {
      setLeaving({ id: was.id, url: was.url, bearing });
    }
    last.current = { id, url };
    // `bearing` sengaja tidak jadi pemicu: ia hanya dibaca saat tempat berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url]);

  // Kalau animasi keluar tidak pernah selesai (tab di latar), lapis lama tetap dibuang.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(undefined), 1400);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const layers: (Layer & { state: "in" | "out" })[] = [];
  if (leaving && leaving.id !== id) layers.push({ ...leaving, state: "out" });
  if (id && url) layers.push({ id, url, bearing, state: "in" });

  return (
    <div className="backdrop" aria-hidden="true">
      {layers.map((l) => (
        <SkyLayer key={l.id} {...l} size={size} onGone={() => setLeaving(undefined)} />
      ))}
      <div className="backdrop-veil" />
    </div>
  );
}

function SkyLayer({
  url,
  size,
  state,
  bearing,
  onGone,
}: Layer & { size: number; state: "in" | "out"; onGone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive || !canvasRef.current) return;
      paint(canvasRef.current, img, STAR_LUT, size);
      setReady(true);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url, size]);

  // Teleskop bergerak ke timur (kiri layar) berarti langit bergeser ke kanan;
  // bergerak ke utara (atas) berarti langit bergeser ke bawah.
  const style = { "--sx": `${bearing.x * 16}vmax`, "--sy": `${bearing.y * 16}vmax` } as React.CSSProperties;

  return (
    <div
      className="sky-layer"
      data-state={ready ? state : "wait"}
      style={style}
      onAnimationEnd={(e) => {
        if (state === "out" && e.target === e.currentTarget) onGone();
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} />
    </div>
  );
}
