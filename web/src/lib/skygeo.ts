// Geometri langit di layar: di mana latar harus diletakkan supaya tepat sejajar
// dengan lensa, dan hitungan sudut untuk perpindahan antar tempat.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "./hooks";

/** Letak pusat lensa di dalam aplikasi, lebar lensa, dan sisi latar, semuanya piksel. */
export type SkyGeometry = { x: number; y: number; lens: number; size: number };

/** Ukur lensa supaya latar bisa dipusatkan tepat di bawahnya. Latar dibuat cukup
 *  besar untuk menutup layar pertama dari pusat lensa ke semua sisi. */
export function useSkyGeometry(
  app: RefObject<HTMLElement | null>,
  lens: RefObject<HTMLElement | null>,
  key: unknown,
): SkyGeometry | undefined {
  const [geometry, setGeometry] = useState<SkyGeometry>();

  useLayoutEffect(() => {
    const a = app.current;
    const l = lens.current;
    if (!a || !l) return;
    let frame = 0;
    const measure = () => {
      const box = a.getBoundingClientRect();
      const slot = l.getBoundingClientRect();
      const x = slot.left + slot.width / 2 - box.left;
      const y = slot.top + slot.height / 2 - box.top;
      const seen = Math.min(box.height, window.innerHeight);
      const next = {
        x: Math.round(x * 2) / 2,
        y: Math.round(y * 2) / 2,
        lens: l.offsetWidth,
        size: Math.ceil(2 * Math.max(x, box.width - x, y, seen - y)),
      };
      setGeometry((cur) =>
        cur && cur.x === next.x && cur.y === next.y && cur.lens === next.lens && cur.size === next.size ? cur : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(a);
    observer.observe(l);
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [app, lens, key]);

  return geometry;
}

type Sky = { ra: number; dec: number };

const RAD = Math.PI / 180;
const unit = (p: Sky) => {
  const c = Math.cos(p.dec * RAD);
  return [c * Math.cos(p.ra * RAD), c * Math.sin(p.ra * RAD), Math.sin(p.dec * RAD)];
};

/** Jarak sudut dua posisi di langit, derajat. */
export function separationDeg(a: Sky, b: Sky): number {
  const [u, v] = [unit(a), unit(b)];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return Math.acos(Math.min(1, Math.max(-1, dot))) / RAD;
}

/** Posisi di sepanjang busur lingkaran besar dari a ke b; t dari 0 sampai 1. */
export function alongArc(a: Sky, b: Sky, t: number): Sky {
  const [u, v] = [unit(a), unit(b)];
  const omega = separationDeg(a, b) * RAD;
  if (omega < 1e-9) return b;
  const ka = Math.sin((1 - t) * omega) / Math.sin(omega);
  const kb = Math.sin(t * omega) / Math.sin(omega);
  const p = [ka * u[0] + kb * v[0], ka * u[1] + kb * v[1], ka * u[2] + kb * v[2]];
  return {
    ra: (Math.atan2(p[1], p[0]) / RAD + 360) % 360,
    dec: Math.asin(Math.min(1, Math.max(-1, p[2]))) / RAD,
  };
}

/** Lama teleskop berpindah, milidetik: makin jauh di langit makin lama. */
export const slewMs = (degrees: number) => Math.round(Math.min(2400, 800 + 14 * degrees));

/** Perlambatan di awal dan akhir, dipakai latar dan pembacaan koordinat. */
export const easeSlew = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const ZOOM_MS = 340;

/** Lebar langit yang benar-benar dilukis, menyusul lebar yang diminta dengan
 *  gerak memperbesar atau memperkecil. Memperbesar: gambar lama dibesarkan dulu
 *  lalu ditukar dengan gambar baru pada skala yang sama. Memperkecil: gambar baru
 *  dilukis dulu dalam keadaan dibesarkan, lalu dikecilkan ke ukuran sebenarnya. */
export function useZoomTween(target: number, node: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const running = useRef<Animation | undefined>(undefined);
  const swap = useRef(0);
  const shrinkFrom = useRef(0);

  useEffect(() => {
    if (target === shown) return;
    const el = node.current;
    running.current?.cancel();
    window.clearTimeout(swap.current);
    if (!el || !enabled || prefersReducedMotion() || typeof el.animate !== "function") {
      setShown(target);
      return;
    }
    if (target < shown) {
      const grow = el.animate([{ transform: "scale(1)" }, { transform: `scale(${shown / target})` }], {
        duration: ZOOM_MS,
        easing: "cubic-bezier(0.3, 0, 0.2, 1)",
        fill: "forwards",
      });
      running.current = grow;
      // Pewaktu, bukan peristiwa selesainya animasi: di tab yang tidak sedang
      // digambar peristiwa itu tertunda dan lensa akan tertahan di gambar lama.
      swap.current = window.setTimeout(() => setShown(target), ZOOM_MS);
    } else {
      shrinkFrom.current = target / shown;
      setShown(target);
    }
    // `shown` sengaja tidak jadi pemicu: efek ini hanya menanggapi permintaan baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  // Berjalan setelah lensa melukis gambar barunya (efek tata letak anak lebih dulu).
  useLayoutEffect(() => {
    const el = node.current;
    running.current?.cancel();
    running.current = undefined;
    const from = shrinkFrom.current;
    shrinkFrom.current = 0;
    if (el && from > 1 && typeof el.animate === "function") {
      running.current = el.animate([{ transform: `scale(${from})` }, { transform: "scale(1)" }], {
        duration: ZOOM_MS,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      });
    }
  }, [shown, node]);

  return shown;
}
