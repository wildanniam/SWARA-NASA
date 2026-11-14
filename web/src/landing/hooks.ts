import { useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/hooks";

/** Apakah elemen sudah (atau sedang) terlihat. Dengan `once`, sekali terlihat tetap true. */
export function useInView<T extends Element>(
  opts: { once?: boolean; rootMargin?: string; threshold?: number } = {},
): [RefObject<T | null>, boolean] {
  const { once = true, rootMargin = "0px", threshold = 0.15 } = opts;
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          if (once) io.disconnect();
        } else if (!once) setSeen(false);
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);
  return [ref, seen];
}

/** Angka yang menghitung naik dari 0 saat `active` menjadi true (sekali). */
export function useCountUp(value: number, active: boolean, ms = 1200, decimals = 0): string {
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current) return;
    done.current = true;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - x, 3);
      setShown(value * eased);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value, ms]);
  return shown.toFixed(decimals);
}

/** Angka yang bergerak halus dari nilai sebelumnya ke `value` setiap kali `value` berubah. */
export function useTween(value: number, ms = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (prefersReducedMotion() || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / ms);
      const v = start + (value - start) * (1 - Math.pow(1 - x, 3));
      from.current = v;
      setShown(v);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

// Satu pengamat untuk semua elemen yang muncul saat digulir (kelas lp-rise). Elemen
// mendaftar lewat `ref={reveal}`; begitu terlihat, ia diberi data-in dan tidak diamati lagi.
let revealer: IntersectionObserver | undefined;
export function reveal(el: Element | null) {
  if (!el || el.hasAttribute("data-in")) return;
  if (typeof IntersectionObserver === "undefined") {
    el.setAttribute("data-in", "");
    return;
  }
  revealer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-in", "");
        revealer!.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
  );
  revealer.observe(el);
}

/** Cocok atau tidaknya media query, mengikuti perubahan. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
