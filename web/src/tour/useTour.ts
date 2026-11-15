// Kapan tur berjalan. Dua bab: peta seluruh langit (2 langkah, berakhir dengan berangkat ke
// bintang tur), lalu teleskop (6 langkah). Orang yang datang lewat tautan ke satu tempat
// langsung mendapat bab teleskop. Sekali per browser; tombol tur di bilah atas mengulanginya.
import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/hooks";
import type { Chapter, TourPlace } from "./tour";

const KEY = "swara:tour";
const SKY_STEPS = 2;
const SCOPE_STEPS = 6;

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    // Tanpa penyimpanan tur akan muncul di tiap kunjungan, jadi tidak dimulai sendiri.
    return true;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* penyimpanan diblokir: tidak ada yang perlu diingat */
  }
}

export interface TourInput {
  /** Peta seluruh langit sedang tampil. */
  atlas: boolean;
  /** Peta dan penanda bintang tur sudah ada, dan peta tidak sedang bergerak. */
  skyReady: boolean;
  /** Lensa terbuka dengan bundle yang lengkap. */
  scopeReady: boolean;
  /** Dialog terbuka atau mode fokus: tur menunggu. */
  blocked: boolean;
  place?: TourPlace;
  /** Penanda bintang tur di peta. */
  star: string;
  /** Sebelum tur diulang: peta kembali ke seluruh langit, atau lensa dibuka. */
  onPrepare: () => void;
  onTravel: () => void;
}

type Phase = "idle" | "sky" | "travel" | "scope";

export function useTour(p: TourInput): { busy: boolean; start: () => void } {
  const [phase, setPhase] = useState<Phase>("idle");
  // Tur masih perlu diberikan: belum pernah, atau diminta lagi lewat tombolnya.
  const [wanted, setWanted] = useState(() => !seen());
  // Diminta lewat tombol: mulai segera, tanpa jeda untuk melihat layar dulu.
  const eager = useRef(false);
  const latest = useRef(p);
  latest.current = p;
  const run = useRef(0);

  const begin = useCallback((chapter: Chapter, joined: boolean) => {
    const id = ++run.current;
    setPhase(chapter);
    void import("./tour").then(({ runTour }) => {
      const now = latest.current;
      // Selagi modul dimuat orang bisa sudah pindah: tur menunggu kesempatan berikutnya.
      if (id !== run.current || now.blocked || (chapter === "sky" ? !now.skyReady : !now.scopeReady)) {
        if (id === run.current) setPhase(joined ? "travel" : "idle");
        return;
      }
      runTour({
        chapter,
        offset: chapter === "scope" && joined ? SKY_STEPS : 0,
        total: chapter === "sky" || joined ? SKY_STEPS + SCOPE_STEPS : SCOPE_STEPS,
        place: now.place,
        star: now.star,
        touch: window.matchMedia("(pointer: coarse)").matches,
        calm: prefersReducedMotion(),
        onTravel: () => latest.current.onTravel(),
        onEnd: (how) => {
          if (how === "travel") {
            setPhase("travel");
            return;
          }
          remember();
          setWanted(false);
          setPhase("idle");
        },
      });
    });
  }, []);

  const { skyReady, scopeReady, blocked, atlas } = p;
  useEffect(() => {
    if (blocked || (phase !== "idle" && phase !== "travel")) return;
    if (phase === "idle" && !wanted) return;
    const quick = eager.current;
    let timer = 0;
    if (phase === "idle" && skyReady) {
      // Beri waktu melihat langitnya dulu sebelum pelat pembuka datang.
      timer = window.setTimeout(
        () => {
          eager.current = false;
          begin("sky", false);
        },
        quick ? 500 : 1300,
      );
    } else if (scopeReady) {
      // Lensa baru saja membuka: tunggu sampai gerak bukanya selesai.
      const joined = phase === "travel";
      timer = window.setTimeout(
        () => {
          eager.current = false;
          begin("scope", joined);
        },
        quick ? 350 : 1500,
      );
    } else if (phase === "travel" && atlas && skyReady) {
      // Berangkat tetapi kembali ke seluruh langit sebelum tiba: mulai lagi dari awal.
      setPhase("idle");
    }
    return () => window.clearTimeout(timer);
  }, [phase, wanted, skyReady, scopeReady, blocked, atlas, begin]);

  const start = useCallback(() => {
    if (phase === "sky" || phase === "scope") return;
    latest.current.onPrepare();
    eager.current = true;
    setPhase("idle");
    setWanted(true);
  }, [phase]);

  return { busy: wanted || phase !== "idle", start };
}
