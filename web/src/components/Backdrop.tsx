import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/hooks";
import { paint } from "../lib/paint";
import type { SkyGeometry } from "../lib/skygeo";

type Props = {
  /** Tempat yang sedang dituju; berganti begitu pengguna memilih, sebelum citranya siap. */
  id?: string;
  /** Citra medan lebar tempat itu, begitu diketahui. */
  url?: string;
  size?: number;
  /** Peta warna yang sama dengan lensa: latar adalah langit yang sama, lebih jauh. */
  lut: Uint8ClampedArray;
  /** Letak pusat lensa dan sisi latar, supaya bintangnya sejajar dengan isi lensa. */
  geometry?: SkyGeometry;
  /** Lensa sedang tertutup: latar tampil terang penuh sebagai pandangan lebar. */
  bright: boolean;
  /** Arah pindah di langit dari tempat sebelumnya: x ke timur, y ke utara, panjang 1. */
  bearing: { x: number; y: number };
  /** Lama dan jauh pergeseran saat pindah tempat, dari jarak sudut yang sebenarnya. */
  slewMs: number;
  travel: number;
};

type Layer = { id: string; url: string; bearing: { x: number; y: number } };

/** Latar langit: citra SPHEREx medan lebar di posisi yang sama dengan lensa,
 *  dipusatkan tepat di bawahnya. Saat tempat berganti, latar lama bergeser pergi
 *  searah gerak teleskop dan latar baru datang dari arah sebaliknya. */
export function Backdrop({ id, url, size = 720, lut, geometry, bright, bearing, slewMs, travel }: Props) {
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
    const timer = window.setTimeout(() => setLeaving(undefined), slewMs + 400);
    return () => window.clearTimeout(timer);
  }, [leaving, slewMs]);

  const layers: (Layer & { state: "in" | "out" })[] = [];
  if (leaving && leaving.id !== id) layers.push({ ...leaving, state: "out" });
  if (id && url) layers.push({ id, url, bearing, state: "in" });

  const style = {
    "--slew-ms": `${slewMs}ms`,
    ...(geometry && { "--sky-x": `${geometry.x}px`, "--sky-y": `${geometry.y}px`, "--sky-size": `${geometry.size}px` }),
  } as React.CSSProperties;

  return (
    <div className="backdrop" data-bright={bright} style={style} aria-hidden="true">
      {layers.map((l) => (
        <SkyLayer key={l.id} {...l} size={size} lut={lut} travel={travel} onGone={() => setLeaving(undefined)} />
      ))}
      <div className="backdrop-veil" />
    </div>
  );
}

function SkyLayer({
  url,
  size,
  lut,
  state,
  bearing,
  travel,
  onGone,
}: Layer & {
  size: number;
  lut: Uint8ClampedArray;
  state: "in" | "out";
  travel: number;
  onGone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement>();

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setImage(img);
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (image && canvasRef.current) paint(canvasRef.current, image, lut, size);
  }, [image, lut, size]);

  // Teleskop bergerak ke timur (kiri layar) berarti langit bergeser ke kanan;
  // bergerak ke utara (atas) berarti langit bergeser ke bawah.
  const style = { "--sx": `${bearing.x * travel}vmax`, "--sy": `${bearing.y * travel}vmax` } as React.CSSProperties;

  return (
    <div
      className="sky-layer"
      data-state={image ? state : "wait"}
      style={style}
      onAnimationEnd={(e) => {
        if (state === "out" && e.target === e.currentTarget) onGone();
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} />
    </div>
  );
}
