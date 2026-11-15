import { useEffect, useRef } from "react";
import { loadAtlas } from "../lib/allsky";
import { prefersReducedMotion } from "../lib/hooks";

// Latar halaman SPHEREx: bintang sungguhan (titik ujung garis rasi, sama dengan landing page),
// redup dan kecil supaya teks tetap terbaca. Berpusat di arah Sagittarius dan Scorpius, bagian
// langit yang lain dari landing page. Saat digulir ia hanyut pelan (paralaks); gerak dikurangi
// membuatnya diam. Tidak ada bintang karangan.

const CENTER_RA = 262;
const CENTER_DEC = -18;
const SPAN_DEG = 150;
const DRIFT = 0.035;

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let alive = true;
    let stars: [number, number][] = [];
    let raf = 0;
    const still = prefersReducedMotion();
    const draw = () => {
      raf = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const px = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * px) || c.height !== Math.round(h * px)) {
        c.width = Math.round(w * px);
        c.height = Math.round(h * px);
      }
      const ctx = c.getContext("2d")!;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const k = Math.max(w, 900) / SPAN_DEG;
      const shift = still ? 0 : window.scrollY * DRIFT;
      ctx.fillStyle = "#fff6e6";
      stars.forEach(([ra, dec], i) => {
        const d = ((ra - CENTER_RA + 540) % 360) - 180;
        const x = w / 2 - d * k;
        const y = h / 2 - (dec - CENTER_DEC) * k - shift;
        if (x < -2 || x > w + 2 || y < -2 || y > h + 2) return;
        const r = Math.abs(Math.sin(i * 12.9898));
        ctx.globalAlpha = 0.14 + 0.26 * r;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + 0.5 * r, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    loadAtlas()
      .then((a) => {
        if (!alive) return;
        const seen = new Set<string>();
        for (const parts of Object.values(a.constellations.lines))
          for (const line of parts)
            for (const [ra, dec] of line) {
              const key = `${ra.toFixed(3)},${dec.toFixed(3)}`;
              if (!seen.has(key)) {
                seen.add(key);
                stars.push([ra, dec]);
              }
            }
        queue();
      })
      .catch(() => undefined);
    window.addEventListener("resize", queue);
    if (!still) window.addEventListener("scroll", queue, { passive: true });
    return () => {
      alive = false;
      stars = [];
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", queue);
      window.removeEventListener("scroll", queue);
    };
  }, []);
  return <canvas ref={ref} className="sx-stars" aria-hidden="true" />;
}
