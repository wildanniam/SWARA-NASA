import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LogoMark, Wordmark } from "../components/Logo";
import { APP_PATH, placeHref } from "../route";
import { loadExamples, type Example } from "./data";
import { Examples } from "./Examples";
import { Features } from "./Features";
import { HeroGlobe, type GlobePin } from "./HeroGlobe";
import { reveal, useCountUp, useInView } from "./hooks";
import "./landing.css";

// Landing page SWARA di "/". Aplikasinya di "/sky". Arah visual dan sasaran tiap bagian ada
// di web/DESIGN.md (bagian Landing page).

const REPO = "https://github.com/wildanniam/SWARA-NASA";
/** Berapa piksel deretan angka menutup bagian bawah hero (dan bola langitnya). */
const STATS_OVERLAP = 96;

const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "why", label: "Why SWARA" },
  { id: "features", label: "What it does" },
  { id: "examples", label: "Examples" },
];

// ---------- navigasi ----------

function Nav() {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; w: number }>();

  // Bagian yang sedang dibaca: yang terakhir melewati garis 35% tinggi layar.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 24);
      const line = window.innerHeight * 0.35;
      let k = 0;
      SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) k = i;
      });
      setActive(k);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Pil penanda meluncur ke menu yang ditunjuk, lalu kembali ke bagian yang sedang dibaca.
  const target = hover ?? active;
  useLayoutEffect(() => {
    const measure = () => {
      const el = items.current[target];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [target]);

  return (
    <header className="lp-nav" data-scrolled={scrolled}>
      <a className="lp-brand" href="/" aria-label="SWARA home">
        <LogoMark size={22} />
        <Wordmark height={15} />
      </a>
      <nav className="lp-menu" aria-label="Sections" onPointerLeave={() => setHover(null)}>
        {pill && <i className="lp-menu-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
        {SECTIONS.map((s, i) => (
          <a
            key={s.id}
            ref={(el) => {
              items.current[i] = el;
            }}
            href={`#${s.id}`}
            aria-current={i === active ? "location" : undefined}
            data-lit={i === target}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <a className="lp-nav-cta" href={APP_PATH}>
        Open the sky
        <ArrowRight weight="bold" />
      </a>
    </header>
  );
}

// ---------- hero ----------

function Hero({ examples }: { examples?: Example[] }) {
  const ctas = useRef<HTMLDivElement>(null);
  const pins = useMemo<GlobePin[]>(
    () =>
      examples?.map((ex) => ({
        id: ex.ref.id,
        name: ex.ref.name,
        short: ex.value !== undefined ? `moved ${ex.short}` : ex.short,
        ra: ex.manifest.ra,
        dec: ex.manifest.dec,
      })) ?? [],
    [examples],
  );
  return (
    <section id="top" className="lp-hero" aria-labelledby="hero-title">
      <HeroGlobe pins={pins} above={ctas} covered={STATS_OVERLAP} />
      <p className="lp-acr">
        <b>S</b>ky <b>W</b>atch with <b>A</b>udio &amp; <b>R</b>eal-time <b>A</b>ccess
      </p>
      <h1 id="hero-title" className="lp-h1">
        Watch the sky change.
      </h1>
      <p className="lp-sub">
        SWARA turns NASA's SPHEREx survey into something anyone can use: pick a patch of sky, see it move across sixteen years, and hear its light.
      </p>
      <div ref={ctas} className="lp-ctas">
        <a className="lp-btn lp-btn-primary" href={APP_PATH}>
          Open the sky
          <ArrowRight weight="bold" />
        </a>
        <a className="lp-btn lp-btn-ghost" href={placeHref("barnard")}>
          Show me a moving star
        </a>
      </div>
    </section>
  );
}

const STATS = [
  { label: "Images over", value: 16, note: "years, 2010 to 2026" },
  { label: "Light split into", value: 102, note: "infrared wavelengths" },
  { label: "Any new place in about", value: 1, note: "minute" },
  { label: "Sign-ups needed", value: 0, note: "open source, AGPL" },
];

function Stat({ label, value, note, run, i }: { label: string; value: number; note: string; run: boolean; i: number }) {
  const shown = useCountUp(value, run, 1100 + i * 180);
  return (
    <div className="lp-stat">
      <small>{label}</small>
      <b>
        <span className="lp-stat-n">{run ? shown : value}</span>
        <i>{note}</i>
      </b>
    </div>
  );
}

function Stats() {
  const [ref, seen] = useInView<HTMLDivElement>({ threshold: 0.4 });
  // Menghitung naik setelah animasi masuk hero selesai.
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (!seen) return;
    const t = window.setTimeout(() => setRun(true), 650);
    return () => window.clearTimeout(t);
  }, [seen]);
  return (
    <div ref={ref} className="lp-stats">
      {STATS.map((s, i) => (
        <Stat key={s.label} {...s} run={run} i={i} />
      ))}
    </div>
  );
}

// ---------- kenapa ----------

const WHY = [
  {
    not: "A single snapshot",
    lead: "Sixteen years,",
    accent: "in order.",
    text: "WISE from 2010, then SPHEREx from 2025, lined up on the same patch so anything that moved gives itself away.",
  },
  {
    not: "A pretty image",
    lead: "A number,",
    accent: "beside the catalogue's.",
    text: "Every shift we measure is shown next to what Gaia and SIMBAD say. What cannot be measured is said plainly.",
  },
  {
    not: "Only for the eyes",
    lead: "Light you can",
    accent: "listen to.",
    text: "The image, the spectrum and the motion play together on one clock, so the sky can be read by ear.",
  },
];

function Why() {
  return (
    <section id="why" className="lp-sec lp-why" aria-labelledby="why-title">
      <span ref={reveal} className="lp-kick lp-rise">
        Why SWARA
      </span>
      <h2 ref={reveal} id="why-title" className="lp-h2 lp-rise">
        Sky viewers show you a picture.
        <br />
        SWARA shows you what happened.
      </h2>
      <div className="lp-why-grid">
        {WHY.map((w, i) => (
          <div key={w.not} ref={reveal} className="lp-why-col lp-rise" style={{ "--d": `${i * 110}ms` } as CSSProperties}>
            <s>
              <span className="sr-only">Not </span>
              {w.not}
            </s>
            <h3>
              {w.lead}
              <br />
              <em>{w.accent}</em>
            </h3>
            <p>{w.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- kaki ----------

const FOOT = [
  {
    title: "Product",
    links: [
      { label: "Open the sky", href: APP_PATH },
      { label: "Show me a moving star", href: placeHref("barnard") },
      { label: "The five examples", href: "#examples" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Source on GitHub", href: REPO, out: true },
      { label: "AGPL-3.0 licence", href: `${REPO}/blob/main/LICENSE`, out: true },
      { label: "How it was measured", href: `${REPO}/blob/main/pipeline/README.md`, out: true },
    ],
  },
  {
    title: "Data",
    links: [
      { label: "NASA SPHEREx · IRSA", href: "https://irsa.ipac.caltech.edu/Missions/spherex.html", out: true },
      { label: "WISE · WiseView", href: "http://byw.tools/wiseview", out: true },
      { label: "ESA Gaia DR3", href: "https://www.cosmos.esa.int/web/gaia/dr3", out: true },
    ],
  },
];

function Footer() {
  return (
    <footer className="lp-foot">
      <div className="lp-foot-top">
        <div className="lp-foot-brand">
          <a className="lp-foot-word" href="#top" aria-label="SWARA, back to top">
            <Wordmark height={54} />
          </a>
          <p>
            <b>Sky Watch with Audio &amp; Real-time Access.</b> An open-source way to watch a patch of sky change, and to hear it.
          </p>
        </div>
        {FOOT.map((col) => (
          <nav key={col.title} aria-labelledby={`foot-${col.title}`}>
            <h2 id={`foot-${col.title}`}>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} {...("out" in l && l.out ? { target: "_blank", rel: "noreferrer" } : {})}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="lp-foot-bot">
        <span>© 2026 SWARA team · AGPL-3.0-or-later</span>
        <span>Built for NASA Space Apps 2026 · Planet X and SPHEREx</span>
      </div>
    </footer>
  );
}

// ---------- halaman ----------

export function Landing() {
  const [examples, setExamples] = useState<Example[]>();
  useEffect(() => {
    let alive = true;
    loadExamples()
      .then((list) => alive && setExamples(list))
      .catch((err) => console.error(err));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="lp">
      <Nav />
      <main>
        <Hero examples={examples} />
        <Stats />
        <Why />
        <Features />
        <Examples examples={examples} />
      </main>
      <Footer />
    </div>
  );
}
