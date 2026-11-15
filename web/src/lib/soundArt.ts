// Gambar dari suara: tiap nada yang berbunyi meninggalkan tanda di lensa, di tempat dan
// detik yang sama. Tidak ada hiasan karangan; semua posisi dan ukuran dari data nada itu.
//   - Pindai: bintang yang sedang dibunyikan berdenyut di posisinya (tinggi nada = utara-selatan).
//   - Spektrum: sinar tipis tumbuh ke dalam dari cincin, satu per nada, pada sudut panjang
//     gelombangnya; panjang sinar = fluks. Mahkota kunjungan sebelumnya tinggal sebagai bayangan.
//   - Gerak: lonceng gerak berbunyi, posisi terukur kunjungan itu berdenyut sekali.
// Digerakkan langsung di DOM oleh jam audio, seperti garis pindai.
import { LAMBDA_MAX, LAMBDA_MIN } from "./spectrum";

const SVG = "http://www.w3.org/2000/svg";
const R = 100; // jari-jari lensa dalam satuan cincin, sama dengan Lens.tsx

/** Bentang mahkota spektrum di cincin, derajat. Bagian bawah dibiarkan untuk tombol lensa. */
export const CROWN_DEG = 230;

export type SoundArt = {
  /** Lapisan denyut bintang, koordinat 0..100 di atas medan penuh. */
  pings: SVGGElement | null;
  /** Lapisan sinar spektrum di cincin, koordinat cincin (pusat 0,0). */
  crown: SVGGElement | null;
  /** Lingkar di posisi terukur kunjungan yang tampil. */
  bell: SVGCircleElement | null;
};

export type ScanPing = { x01: number; row01: number; vol: number; glint: boolean; flagged: boolean };

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Panjang gelombang -> sudut di cincin, derajat dari utara searah jarum jam. */
export function crownAngle(lambda: number): number {
  const f = Math.min(1, Math.max(0, (lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)));
  return -CROWN_DEG / 2 + f * CROWN_DEG;
}

/** Bagian mahkota yang sudah terdengar, 0..1. */
export function crownFraction(lambda: number): number {
  return (crownAngle(lambda) + CROWN_DEG / 2) / CROWN_DEG;
}

function fadeOut(el: SVGElement, ms: number, delay = 0, from?: number) {
  const a = el.animate([{ opacity: from ?? getComputedStyle(el).opacity }, { opacity: 0 }], {
    duration: reduced() ? 1 : ms,
    delay: reduced() ? 0 : delay,
    easing: "ease-out",
    fill: "forwards",
  });
  a.onfinish = () => el.remove();
}

/** Satu kolom pindai berbunyi: tiap puncaknya berdenyut, yang berkilau mendapat cincin. */
export function pingColumn(art: SoundArt, peaks: ScanPing[]) {
  const g = art.pings;
  if (!g) return;
  for (const p of peaks) {
    const x = p.x01 * 100;
    const y = p.row01 * 100;
    const dot = document.createElementNS(SVG, "circle");
    dot.setAttribute("class", p.flagged ? "ping ping-flagged" : "ping");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", (1.6 + 1.8 * p.vol).toFixed(2));
    g.appendChild(dot);
    if (!reduced()) {
      dot.animate([{ transform: "scale(0.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 1 }], {
        duration: 260,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    }
    fadeOut(dot, 1300, 520, 1);
    if (p.glint) {
      const ring = document.createElementNS(SVG, "circle");
      ring.setAttribute("class", "ping-ring");
      ring.setAttribute("cx", String(x));
      ring.setAttribute("cy", String(y));
      ring.setAttribute("r", "6.5");
      g.appendChild(ring);
      if (reduced()) fadeOut(ring, 1, 600);
      else {
        const a = ring.animate([{ transform: "scale(0.25)", opacity: 0.95 }, { transform: "scale(1)", opacity: 0 }], {
          duration: 900,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        });
        a.onfinish = () => ring.remove();
      }
    }
  }
}

/** Satu nada spektrum berbunyi: satu sinar tumbuh ke dalam dari cincin. */
export function addRay(art: SoundArt, lambda: number, heat: number | null, unverified: boolean) {
  const g = art.crown;
  if (!g) return;
  const line = document.createElementNS(SVG, "line");
  // Langkah tanpa nilai: hanya bintik kecil di cincin, supaya celahnya tetap terlihat jujur.
  const len = heat === null ? 0.9 : 2 + 10 * Math.sqrt(Math.min(1, Math.max(0, heat)));
  const r0 = R - 1.6;
  line.setAttribute("class", heat === null ? "ray ray-empty" : unverified ? "ray ray-flagged" : "ray");
  line.setAttribute("x1", "0");
  line.setAttribute("y1", String(-r0));
  line.setAttribute("x2", "0");
  line.setAttribute("y2", String(-(r0 - len)));
  line.setAttribute("transform", `rotate(${crownAngle(lambda).toFixed(2)})`);
  g.appendChild(line);
  if (!reduced()) {
    line.animate([{ strokeDashoffset: len, strokeDasharray: `${len} ${len}` }, { strokeDashoffset: 0, strokeDasharray: `${len} ${len}` }], {
      duration: 220,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  }
}

/** Kunjungan berganti: mahkota yang baru selesai jadi bayangan, bayangan lebih lama hilang. */
export function ghostCrown(art: SoundArt) {
  const g = art.crown;
  if (!g) return;
  for (const el of Array.from(g.children) as SVGElement[]) {
    if (el.classList.contains("ghost")) fadeOut(el, 400);
    else el.classList.add("ghost");
  }
}

/** Lonceng gerak berbunyi: posisi terukur kunjungan ini berdenyut sekali. */
export function ringBell(art: SoundArt) {
  const c = art.bell;
  if (!c) return;
  c.getAnimations().forEach((a) => a.cancel());
  c.animate(
    reduced()
      ? [{ opacity: 0.9 }, { opacity: 0 }]
      : [
          { transform: "scale(0.35)", opacity: 0 },
          { transform: "scale(0.6)", opacity: 0.95, offset: 0.12 },
          { transform: "scale(1.9)", opacity: 0 },
        ],
    { duration: 1400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}

/** Suara berhenti: semua tanda memudar. */
export function clearArt(art: SoundArt) {
  for (const g of [art.pings, art.crown]) {
    if (!g) continue;
    for (const el of Array.from(g.children) as SVGElement[]) {
      el.getAnimations().forEach((a) => (a.onfinish = null));
      fadeOut(el, 700);
    }
  }
}
