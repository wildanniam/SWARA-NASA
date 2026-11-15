import { useEffect, useRef, useState } from "react";
import { assetUrl, defaultBand, findFrame, loadManifest, type Manifest } from "../lib/bundle";
import { paint } from "../lib/paint";
import { LUTS, type PaletteId } from "../lib/palette";
import { verdict, type Verdict } from "../lib/verdict";

const manifests = new Map<string, Promise<Manifest>>();

/** Manifest satu tempat, dimuat sekali dan dipakai bersama oleh cuplikan di "Go to" dan di peta. */
export function placeManifest(id: string, custom: boolean): Promise<Manifest> {
  const key = `${custom ? "api" : "preset"}:${id}`;
  let pending = manifests.get(key);
  if (!pending) {
    pending = loadManifest(id, custom);
    manifests.set(key, pending);
    pending.catch(() => manifests.delete(key));
  }
  return pending;
}

type Props = {
  id: string;
  custom: boolean;
  /** Tempat yang bundelnya belum jadi belum punya citra. */
  enabled: boolean;
  look?: PaletteId;
  size?: number;
  /** Jendela melengkung seperti jendela kartu, bukan bundar: dipakai saat SWARA bercerita
   *  tentang sebuah tempat (cuplikan penanda, daftar Go to). */
  arch?: boolean;
};

/** Julukan dan angka terukur tempat itu, begitu manifestnya termuat. */
export function useVerdict(id: string, custom: boolean, enabled: boolean): Verdict | undefined {
  const [v, setV] = useState<Verdict>();
  useEffect(() => {
    setV(undefined);
    if (!enabled) return;
    let alive = true;
    placeManifest(id, custom)
      .then((m) => alive && setV(verdict(m, id, custom)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, custom, enabled]);
  return v;
}

/** Cuplikan bundar dari citra asli benda itu: kunjungan pertama di band bawaannya. */
export function PlaceThumb({ id, custom, enabled, look = "heat", size = 96, arch = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    placeManifest(id, custom)
      .then((m) => {
        const band = defaultBand(m);
        const frame = m.windows.map((w) => findFrame(m, w.id, band)).find(Boolean);
        if (!frame || !alive) return;
        const img = new Image();
        img.onload = () => {
          if (!alive || !ref.current) return;
          // Cuplikan menampilkan 2 menit busur di tengah, sebesar apa pun medan bundle-nya.
          const w = (Math.min(120, m.fov_arcsec) / m.fov_arcsec) * m.frame_px;
          const view = { x: (m.frame_px - w) / 2, y: (m.frame_px - w) / 2, w, h: w };
          paint(ref.current, img, LUTS[look], size, undefined, view);
          setShown(true);
        };
        img.src = assetUrl(id, custom, frame.image);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, custom, enabled, look, size]);

  const canvas = <canvas ref={ref} className="thumb" data-shown={shown} width={size} height={size} aria-hidden="true" />;
  return arch ? (
    <span className="arch" data-shown={shown} aria-hidden="true">
      {canvas}
    </span>
  ) : (
    canvas
  );
}
