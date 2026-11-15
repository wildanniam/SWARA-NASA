// Tur berpemandu di /sky. driver.js mengurus sorotan, letak popover, dan fokus papan ketik;
// yang terlihat (pelat, cincin, garis penunjuk, skala langkah) milik SWARA, di tour.css.
// Modul ini dimuat hanya saat tur berjalan, jadi pengunjung yang sudah selesai tidak mengunduhnya.
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

export type Chapter = "sky" | "scope";

/** Yang perlu diketahui teks bab teleskop tentang tempat yang sedang tampil. */
export interface TourPlace {
  name: string;
  /** Ada riwayat WISE, jadi deretannya 16 tahun. */
  long: boolean;
  /** SPHEREx mengukur pergeseran. */
  moved: boolean;
}

export interface RunOptions {
  chapter: Chapter;
  /** Nomor langkah pertama bab ini (dari 0) dan jumlah langkah seluruh tur, untuk skala. */
  offset: number;
  total: number;
  place?: TourPlace;
  /** Penanda bintang tujuan di peta seluruh langit. */
  star?: string;
  touch: boolean;
  calm: boolean;
  /** Bab langit selesai: arahkan teleskop ke bintang tur. */
  onTravel?: () => void;
  onEnd: (how: "done" | "skipped" | "travel") => void;
}

/** Bentuk sorotan tiap langkah: jarak dari elemen, sudut, redupnya layar, dan apakah
 *  elemennya diminta diklik (cincinnya berdenyut). */
interface Stage {
  pad: number;
  /** Tambahan jarak sebagai bagian dari lebar elemen: cincin skala lensa 9% lebih lebar dari lensanya. */
  rim?: number;
  radius: number;
  /** Sorotan bundar: kalau pelat tidak muat di samping atau di bawahnya, pelat pindah ke
   *  sudut layar, yang tidak tertutup lingkaran. */
  corner?: boolean;
  dim?: number;
  act?: boolean;
}

const MORPH_MS = 480;
const GAP = 22;
const DIM = 0.74;

function skySteps(o: RunOptions): DriveStep[] {
  return [
    {
      popover: {
        title: "This is the whole sky",
        description:
          "You are looking out from Earth in every direction, so Earth, the Sun and the Moon are not on this map. Every point of light is real data from SPHEREx, a NASA space telescope that sees infrared light, which our eyes cannot. The bright band is our own galaxy, seen from inside.",
        nextBtnText: "Show me around",
      },
      data: { pad: 0, radius: 0, dim: 0.5 } satisfies Stage,
    },
    {
      element: o.star,
      popover: {
        title: "Start with a star that moves",
        description: `The amber rings mark places worth a look. Barnard's Star drifts across our sky faster than any other star. ${o.touch ? "Tap" : "Click"} it to point the telescope there.`,
        side: "bottom",
        align: "center",
        doneBtnText: "Take me there",
      },
      data: { pad: 14, radius: 999, act: true } satisfies Stage,
    },
  ];
}

function scopeSteps(o: RunOptions): DriveStep[] {
  const place = o.place ?? { name: "the object", long: false, moved: false };
  return [
    {
      element: ".lens-slot",
      disableActiveInteraction: true,
      popover: {
        title: place.long ? "Sixteen years of one small patch" : "One small patch, seen again and again",
        description: `The lens plays ${place.long ? "pictures of this spot taken since 2010" : "the SPHEREx pictures of this spot"}, one after another. The amber mark is fixed on the sky${
          place.moved ? `: watch ${place.name} slide past it while the stars around stay put.` : ", so anything that moves slides past it."
        }`,
        side: "right",
        align: "center",
      },
      data: { pad: 0, rim: 0.086, radius: 999, corner: true } satisfies Stage,
    },
    {
      element: ".dock > .dock-row:first-child",
      popover: {
        title: "Time runs along this line",
        description: place.long
          ? "Each mark is one picture: the WISE telescope from 2010, then SPHEREx from 2025. Press the round button to play them in order, or pick any mark to jump to that date."
          : "Each mark is one SPHEREx visit, about six months apart. Press the round button to blink between them, or pick any mark.",
        side: "top",
        align: "start",
      },
      data: { pad: 12, radius: 18 } satisfies Stage,
    },
    {
      element: ".finding",
      disableActiveInteraction: true,
      popover: {
        title: "What the pictures say",
        description:
          "This is measured from the SPHEREx pictures themselves: how far the object shifted, in arcseconds (″). The full Moon is about 1,900″ wide, so these are tiny steps. When something cannot be measured, SWARA says so.",
        side: "bottom",
        align: "start",
      },
      data: { pad: 20, radius: 18 } satisfies Stage,
    },
    {
      element: ".dock-light",
      popover: {
        title: "Its light, drawn and played",
        description:
          "SPHEREx measures infrared light colour by colour. This strip draws how bright each one is, and the round button plays it as sound.",
        side: "top",
        align: "start",
      },
      data: { pad: 12, radius: 18 } satisfies Stage,
    },
    {
      element: ".pill-cards",
      disableActiveInteraction: true,
      popover: {
        title: "The story, in three cards",
        description: "Where it lives, how it moved, and what its light looks like, told plainly. You can draw a card to keep or share.",
        side: "bottom",
        align: "end",
      },
      data: { pad: 8, radius: 999 } satisfies Stage,
    },
    {
      element: ".goto-trigger",
      advanceOnClick: true,
      popover: {
        title: "Now choose your own place",
        description:
          "Type a name or a pair of coordinates here. Or press the SWARA mark, top left, to return to the whole sky and aim anywhere: SPHEREx has looked at all of it.",
        side: "bottom",
        align: "center",
        doneBtnText: "Start exploring",
      },
      data: { pad: 8, radius: 999 } satisfies Stage,
    },
  ];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (k: number) => k * k * (3 - 2 * k);

/** Jalankan satu bab tur. Berakhir lewat `onEnd`: selesai, dilewati, atau berangkat ke bintang tur. */
export function runTour(o: RunOptions): void {
  const steps = o.chapter === "sky" ? skySteps(o) : scopeSteps(o);
  let over = false;
  let raf = 0;
  let first = true;
  // Bentuk sorotan yang sedang digambar, dan peralihannya ke bentuk langkah berikutnya.
  let pad = 0;
  let radius = 0;
  let morph: { t0: number; p0: number; p1: number; r0: number; r1: number; nominal: number } | undefined;
  // Seberapa redup layar di luar sorotan pada langkah ini.
  let dim = DIM;
  // Langkah ini boleh memindahkan pelatnya ke sudut layar.
  let corner = false;
  // Kotak elemen pada bingkai sebelumnya, dan apakah sorotan saat itu masih berpindah.
  let lastBox = "";
  let wasMoving = false;

  // Cincin ambar di tepi sorotan: digambar sendiri, mengikuti sorotan driver.js tiap bingkai.
  const ring = document.createElement("div");
  ring.className = "tour-ring";
  ring.setAttribute("aria-hidden", "true");
  ring.hidden = true;
  document.body.appendChild(ring);

  let d: Driver;

  const setStage = (p: number, r: number) => {
    pad = p;
    radius = r;
    d.setConfig({ ...d.getConfig(), stagePadding: p, stageRadius: r });
  };

  // Selama tur, tombol pintas aplikasi diam: panah dan Esc milik tur (driver.js mendengarnya
  // di keyup), dan "/" tidak membuka dialog di bawah sorotan. Tab tetap jalan untuk fokus.
  const quiet = (e: KeyboardEvent) => {
    if (e.key !== "Tab") e.stopImmediatePropagation();
  };

  // Mengeklik bintang yang disorot sama dengan "Take me there". Ditangkap lebih dulu supaya
  // di layar sentuh ketukan pertama tidak hanya membuka cuplikan penanda.
  const onStar = (e: MouseEvent) => {
    const active = d.getActiveElement();
    if (o.chapter !== "sky" || !d.isLastStep() || !active || !(e.target instanceof Node) || !active.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    finish("travel");
  };

  const finish = (how: "done" | "skipped" | "travel") => {
    if (over) return;
    over = true;
    window.cancelAnimationFrame(raf);
    window.removeEventListener("keydown", quiet, true);
    document.removeEventListener("click", onStar, true);
    d.destroy();
    ring.remove();
    if (how === "travel") o.onTravel?.();
    o.onEnd(how);
  };

  const frame = (now: number) => {
    raf = window.requestAnimationFrame(frame);
    if (morph) {
      const k = clamp01((now - morph.t0) / (MORPH_MS * 0.45));
      const e = smooth(k);
      setStage(morph.p0 + (morph.p1 - morph.p0) * e, morph.r0 + (morph.r1 - morph.r0) * e);
      if (k >= 1) {
        setStage(morph.p1, morph.nominal);
        morph = undefined;
      }
    }
    // Tirai dibuat driver.js pada bingkai pertamanya, jadi redupnya disetel di sini.
    const veil = d.getState("__overlaySvg")?.firstElementChild as SVGPathElement | null | undefined;
    if (veil && veil.style.opacity !== String(dim)) veil.style.opacity = String(dim);
    const el = d.getActiveElement();
    // Jendela yang sempit dan tinggi: lensa memakan hampir seluruh lebar dan tinggi, jadi
    // pelat ditaruh di sudut kanan bawah alih-alih menimpa lensa.
    const plate = d.getState("popover")?.wrapper as HTMLElement | undefined;
    if (plate) {
      let tucked = false;
      if (corner && el && el.id !== "driver-dummy-element") {
        const b = el.getBoundingClientRect();
        const goal = morph?.p1 ?? pad;
        const need = GAP + 12;
        tucked =
          window.innerWidth - (b.right + goal) < plate.offsetWidth + need && window.innerHeight - (b.bottom + goal) < plate.offsetHeight + need;
      }
      plate.classList.toggle("tour-corner", tucked);
    }
    const at = d.getState("__activeStagePosition") as { x: number; y: number; width: number; height: number } | undefined;
    const real = !!el && el.id !== "driver-dummy-element";
    if (!at || !real) {
      ring.hidden = true;
      return;
    }
    const w = at.width + pad * 2;
    const h = at.height + pad * 2;
    ring.hidden = false;
    ring.style.transform = `translate(${at.x - pad}px, ${at.y - pad}px)`;
    ring.style.width = `${w}px`;
    ring.style.height = `${h}px`;
    ring.style.setProperty("--r", `${Math.max(0, Math.min(radius, w / 2, h / 2))}px`);
    // Sorotan dan pelat mengikuti elemennya. driver.js meletakkan pelat di tengah peralihan
    // dan hanya membetulkannya saat halaman digulir sesudah peralihan selesai; di ponsel
    // gulir halus bisa selesai lebih dulu, dan tata letak bisa bergeser sesudahnya (huruf
    // selesai dimuat, peta ditata ulang). Jadi letaknya dicek tiap bingkai.
    const moving = !!d.getState("__transitionCallback");
    if (!moving && el) {
      const b = el.getBoundingClientRect();
      const key = `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}`;
      if (wasMoving || key !== lastBox) d.refresh();
      lastBox = key;
    }
    wasMoving = moving;
  };

  d = driver({
    steps,
    animate: !o.calm,
    duration: MORPH_MS,
    smoothScroll: !o.calm,
    overlayColor: "#05060b",
    overlayOpacity: DIM,
    // Klik di luar sorotan tidak menutup tur: yang tertutup tidak sengaja tidak muncul lagi.
    overlayClickBehavior: "none",
    popoverClass: "swara-tour",
    popoverOffset: GAP,
    stagePadding: 0,
    stageRadius: 0,
    showProgress: true,
    progressText: " ",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    closeBtnLabel: "Close the tour",
    onHighlightStarted: (el, step) => {
      const want = (step.data ?? { pad: 10, radius: 18 }) as Stage;
      // Jarak sorotan dari elemennya; di layar sempit dikurangi supaya cincin tidak keluar layar.
      const box = el?.getBoundingClientRect();
      const room = box ? Math.max(4, Math.min(box.left, window.innerWidth - box.right) - 7) : 0;
      const wantPad = Math.round(Math.min(want.pad + (want.rim && box ? box.width * want.rim : 0), box ? room : want.pad));
      ring.dataset.act = String(!!want.act && !!el);
      dim = want.dim ?? DIM;
      corner = !!want.corner;
      if (first || o.calm || !el) {
        first = false;
        morph = undefined;
        setStage(wantPad, want.radius);
        return;
      }
      // Dari bentuk yang sekarang terlihat ke bentuk langkah ini, selesai sebelum popover
      // diletakkan (driver.js meletakkannya di tengah peralihan).
      const now = d.getState("__activeStagePosition") as { width: number; height: number } | undefined;
      const b = el.getBoundingClientRect();
      const seen = now ? Math.min(radius, (now.width + pad * 2) / 2, (now.height + pad * 2) / 2) : radius;
      const goal = Math.min(want.radius, (b.width + wantPad * 2) / 2, (b.height + wantPad * 2) / 2);
      morph = { t0: performance.now(), p0: pad, p1: wantPad, r0: seen, r1: goal, nominal: want.radius };
    },
    onPopoverRender: (pop, { state }) => {
      const index = state.activeIndex ?? 0;
      const n = o.offset + index;
      const hello = o.chapter === "sky" && index === 0;
      pop.wrapper.classList.toggle("swara-tour-hello", hello);
      pop.wrapper.style.setProperty("--tour-gap", `${GAP}px`);

      // Kepala: nomor langkah dan satu garis tipis; langkah pembuka memakai satu baris keterangan.
      // Nomornya angka biasa, bukan Romawi: II dan III sudah dipakai dok untuk Path dan Light.
      const head = document.createElement("div");
      head.className = "tour-head";
      if (hello) {
        const kicker = document.createElement("span");
        kicker.className = "tour-kicker";
        kicker.textContent = "A short tour · about a minute";
        head.appendChild(kicker);
      } else {
        const numeral = document.createElement("b");
        numeral.className = "tour-numeral";
        numeral.textContent = String(n + 1).padStart(2, "0");
        const rule = document.createElement("i");
        rule.className = "tour-rule";
        head.append(numeral, rule);
      }
      pop.wrapper.insertBefore(head, pop.title);

      // Skala langkah, seperti tanda di garis waktu: yang sudah lewat menyala, yang sekarang lebih tinggi.
      pop.progress.textContent = "";
      pop.progress.setAttribute("role", "img");
      pop.progress.setAttribute("aria-label", `Step ${n + 1} of ${o.total}`);
      for (let i = 0; i < o.total; i++) {
        const tick = document.createElement("i");
        tick.dataset.state = i < n ? "past" : i === n ? "now" : "ahead";
        pop.progress.appendChild(tick);
      }

      // Fokus pertama jatuh ke tombol utama (driver.js memfokus tombol pertama di popover),
      // jadi Enter melanjutkan; urutan tampilnya diatur di CSS.
      pop.footerButtons.insertBefore(pop.nextButton, pop.previousButton);
      pop.wrapper.appendChild(pop.closeButton);
      if (hello) {
        const later = document.createElement("button");
        later.type = "button";
        later.className = "tour-later";
        later.textContent = "Not now";
        later.addEventListener("click", () => finish("skipped"));
        pop.footerButtons.appendChild(later);
      }
    },
    onDestroyStarted: (_el, _step, { reason }) => {
      if (reason === "done") finish(o.chapter === "sky" ? "travel" : "done");
      else finish("skipped");
    },
  });

  window.addEventListener("keydown", quiet, true);
  document.addEventListener("click", onStar, true);
  d.drive();
  raf = window.requestAnimationFrame(frame);
}
