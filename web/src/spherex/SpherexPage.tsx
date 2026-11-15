import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import { LogoMark, Wordmark } from "../components/Logo";
import { APP_PATH } from "../route";
import "./spherex.css";

// Halaman "/spherex": penjelasan misi SPHEREx untuk orang umum. Semua angka di sini harus
// sama dengan sumber di bagian Sources dan dengan fakta data di AGENTS.md. Citra yang
// dipakai hanya citra asli: peta seluruh langit SPHEREx DR1 dari bundles/allsky dan
// gambar resmi NASA/JPL-Caltech di public/spherex (kreditnya di bawah tiap gambar).

/** Enam band = enam detektor; rentangnya dari halaman instrumen Caltech (tabel band). */
const BANDS = [
  { id: "D1", lo: 0.75, hi: 1.09 },
  { id: "D2", lo: 1.1, hi: 1.62 },
  { id: "D3", lo: 1.63, hi: 2.41 },
  { id: "D4", lo: 2.42, hi: 3.82 },
  { id: "D5", lo: 3.83, hi: 4.41 },
  { id: "D6", lo: 4.42, hi: 5.0 },
];

const SOURCES = [
  {
    href: "https://science.nasa.gov/mission/spherex/",
    title: "NASA Science: SPHEREx",
    note: "Full name, mission goals",
  },
  {
    href: "https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/spacecraft/",
    title: "NASA JPL press kit: the spacecraft",
    note: "Photon shields, cooling to about −210 °C, 102 colours, orbit",
  },
  {
    href: "https://www.jpl.nasa.gov/news/cosmic-mapmaker-nasas-spherex-space-telescope-ready-to-launch/",
    title: "NASA JPL: SPHEREx ready to launch",
    note: "Launch on 11 March 2025, linear variable filters, four all-sky maps in two years",
  },
  {
    href: "https://spherex.caltech.edu/page/instrument",
    title: "Caltech: SPHEREx instrument",
    note: "20 cm telescope, 3.5° × 11.3° view, six 2048 × 2048 detectors, band edges, dichroic",
  },
  {
    href: "https://www.nasa.gov/technology/space-comms/nasa-expands-spherex-science-return-through-commercial-partnership/",
    title: "NASA: SPHEREx data via KSAT and the Near Space Network",
    note: "Troll station in Antarctica, relay satellites, DAPHNE+ cloud",
  },
  {
    href: "https://irsa.ipac.caltech.edu/Missions/spherex.html",
    title: "NASA/IPAC Infrared Science Archive (IRSA): SPHEREx",
    note: "Processing at IPAC, Quick Release and DR1 data, 6.15″ pixels in the image headers",
  },
  {
    href: "https://arxiv.org/abs/2511.02985",
    title: "Bock et al. 2025, The SPHEREx Satellite Mission",
    note: "As-flown instrument and survey parameters",
  },
  {
    href: "https://arxiv.org/abs/1412.4872",
    title: "Doré et al. 2014, Cosmology with the SPHEREx All-Sky Spectral Survey",
    note: "Science case",
  },
  {
    href: "https://www.jpl.nasa.gov/images/pia26531-spherex-in-orbit-artists-concept/",
    title: "Image credits: NASA/JPL-Caltech (PIA26531), NASA (cutaway render, data-flow graphic)",
    note: "Used with credit; no NASA endorsement implied",
  },
];

// ---------- muncul saat digulir ----------

/** Satu pengamat untuk semua elemen [data-rise]: diberi data-in saat masuk layar. */
function useRise(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-rise]");
    if (typeof IntersectionObserver === "undefined") {
      items.forEach((i) => i.setAttribute("data-in", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/** Kembali ke tempat yang sedang dilihat kalau datang dari aplikasi, kalau tidak ke /sky. */
function backHref(): string {
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === window.location.origin && ref.pathname.replace(/\/+$/, "") === APP_PATH) return ref.pathname + ref.search;
  } catch {
    /* tanpa referrer */
  }
  return APP_PATH;
}

function Section({ id, n, kick, title, children }: { id: string; n: string; kick: string; title: string; children: ReactNode }) {
  return (
    <section className="sx-sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="sx-head" data-rise>
        <span className="sx-num" aria-hidden="true">
          {n}
        </span>
        <p className="sx-kick">{kick}</p>
        <h2 id={`${id}-h`}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

type Mark = { n: string; x: number; y: number; label: string };

function Figure(props: { src: string; alt: string; credit: string; w: number; h: number; className?: string; marks?: Mark[] }) {
  const { src, alt, credit, w, h, className, marks } = props;
  return (
    <figure className={`sx-fig ${className ?? ""}`} data-rise>
      <div className="sx-plate">
        <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
        {marks?.map((m, i) => (
          <span
            key={m.n}
            className="sx-mark"
            style={{ left: `${m.x}%`, top: `${m.y}%`, ["--k" as string]: i }}
            aria-hidden="true"
          >
            <i>{m.n}</i>
            <em>{m.label}</em>
          </span>
        ))}
      </div>
      <figcaption>{credit}</figcaption>
    </figure>
  );
}

// ---------- diagram ----------

/** Penanda panah: ujungnya runcing dan selalu searah garis, jadi arah terbaca jelas. */
function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
      </marker>
    </defs>
  );
}

/** Filter variabel linier: panjang gelombang berubah di sepanjang detektor. Langit digeser
 *  di antara eksposur, jadi satu bintang jatuh di warna yang berbeda tiap kali. */
function LvfDiagram() {
  const strips = 12;
  return (
    <svg className="sx-diagram" viewBox="0 0 640 330" role="img" aria-labelledby="lvf-t lvf-d">
      <title id="lvf-t">How a linear variable filter builds a spectrum</title>
      <desc id="lvf-d">
        A detector whose filter passes a different wavelength at each height. Between exposures the telescope points slightly
        further along, so the same star lands on a new wavelength each time. Three exposures give three points of its spectrum.
      </desc>
      <ArrowDefs id="lvf-arrow" />
      <defs>
        <linearGradient id="lvf-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#cdd6ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffb454" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {/* detektor */}
      <g transform="translate(40 34)">
        <rect width="190" height="250" rx="4" fill="url(#lvf-grad)" opacity="0.32" />
        {Array.from({ length: strips }, (_, i) => (
          <line key={i} x1="0" x2="190" y1={(250 / strips) * i} y2={(250 / strips) * i} stroke="#05060b" strokeOpacity="0.55" />
        ))}
        <rect width="190" height="250" rx="4" fill="none" stroke="rgba(205,214,255,0.4)" />
        <text className="sx-svg-mono" x="-8" y="246" textAnchor="end">
          short
        </text>
        <text className="sx-svg-mono" x="-8" y="10" textAnchor="end">
          long
        </text>
        {/* bintang yang sama di tiga eksposur */}
        {[
          { y: 200, k: 1 },
          { y: 125, k: 2 },
          { y: 50, k: 3 },
        ].map(({ y, k }) => (
          <g key={k} className="sx-lvf-star" style={{ ["--k" as string]: k }}>
            <circle cx="95" cy={y} r="7" fill="#f2efe8" />
            <circle cx="95" cy={y} r="13" fill="none" stroke="#ffb454" strokeOpacity="0.7" />
            <text className="sx-svg-mono sx-svg-dim" x="118" y={y + 4}>
              exp. {k}
            </text>
          </g>
        ))}
        {/* arah langit bergeser antar eksposur */}
        <line x1="210" y1="200" x2="210" y2="56" stroke="#ffb454" strokeWidth="1.5" markerEnd="url(#lvf-arrow)" color="#ffb454" />
        <text className="sx-svg-mono sx-svg-accent" x="222" y="132">
          star steps
        </text>
        <text className="sx-svg-mono sx-svg-accent" x="222" y="148">
          across filter
        </text>
      </g>
      {/* spektrum yang terbentuk */}
      <g transform="translate(380 34)">
        <line
          x1="0"
          y1="250"
          x2="230"
          y2="250"
          stroke="rgba(205,214,255,0.4)"
          markerEnd="url(#lvf-arrow)"
          color="rgba(205,214,255,0.6)"
        />
        <line
          x1="0"
          y1="250"
          x2="0"
          y2="16"
          stroke="rgba(205,214,255,0.4)"
          markerEnd="url(#lvf-arrow)"
          color="rgba(205,214,255,0.6)"
        />
        <text className="sx-svg-mono sx-svg-dim" x="230" y="276" textAnchor="end">
          wavelength
        </text>
        <text className="sx-svg-mono sx-svg-dim" x="10" y="14">
          brightness
        </text>
        {[
          { x: 50, y: 150, k: 1 },
          { x: 120, y: 95, k: 2 },
          { x: 190, y: 170, k: 3 },
        ].map(({ x, y, k }) => (
          <g key={k} className="sx-lvf-point" style={{ ["--k" as string]: k }}>
            <circle cx={x} cy={y} r="6" fill="#ffb454" />
            <text className="sx-svg-mono" x={x} y={y - 14} textAnchor="middle">
              {k}
            </text>
          </g>
        ))}
      </g>
      <line
        x1="300"
        y1="100"
        x2="362"
        y2="100"
        stroke="#f2efe8"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        markerEnd="url(#lvf-arrow)"
        color="#f2efe8"
      />
    </svg>
  );
}

/** Jalur cahaya: teleskop, pemisah dikroik, lalu dua bidang fokus berisi tiga detektor. */
function SplitDiagram() {
  const det = (x: number, y: number, label: string) => (
    <g key={label}>
      <rect x={x} y={y} width="58" height="58" rx="3" fill="rgba(205,214,255,0.06)" stroke="rgba(205,214,255,0.4)" />
      <text className="sx-svg-mono" x={x + 29} y={y + 34} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg className="sx-diagram" viewBox="0 0 640 300" role="img" aria-labelledby="split-t split-d">
      <title id="split-t">Light path to the six detectors</title>
      <desc id="split-d">
        Light from the telescope reaches a dichroic beam splitter. Shorter wavelengths, 0.75 to 2.42 microns, go to one focal
        plane with bands 1 to 3. Longer wavelengths, 2.42 to 5.0 microns, go to the other with bands 4 to 6.
      </desc>
      <ArrowDefs id="split-arrow" />
      <text className="sx-svg-mono sx-svg-dim" x="20" y="146">
        telescope
      </text>
      <line
        x1="20"
        y1="160"
        x2="232"
        y2="160"
        stroke="#f2efe8"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        markerEnd="url(#split-arrow)"
        color="#f2efe8"
      />
      {/* pemisah dikroik */}
      <line x1="222" y1="196" x2="282" y2="124" stroke="#ffb454" strokeWidth="3" />
      <text className="sx-svg-mono sx-svg-accent" x="252" y="228" textAnchor="middle">
        dichroic
      </text>
      <line
        x1="258"
        y1="150"
        x2="380"
        y2="76"
        stroke="#cdd6ff"
        strokeOpacity="0.8"
        strokeWidth="1.5"
        markerEnd="url(#split-arrow)"
        color="#cdd6ff"
      />
      <line
        x1="258"
        y1="170"
        x2="380"
        y2="244"
        stroke="#ffb454"
        strokeOpacity="0.9"
        strokeWidth="1.5"
        markerEnd="url(#split-arrow)"
        color="#ffb454"
      />
      {det(394, 20, "1")}
      {det(458, 20, "2")}
      {det(522, 20, "3")}
      <text className="sx-svg-mono" x="394" y="100">
        0.75 to 2.42 µm
      </text>
      {det(394, 214, "4")}
      {det(458, 214, "5")}
      {det(522, 214, "6")}
      <text className="sx-svg-mono" x="394" y="204">
        2.42 to 5.0 µm
      </text>
    </svg>
  );
}

// ---------- halaman ----------

export function SpherexPage() {
  const root = useRef<HTMLDivElement>(null);
  const back = useRef(APP_PATH);
  back.current = typeof document === "undefined" ? APP_PATH : backHref();
  useRise(root);

  useEffect(() => {
    document.title = "What is SPHEREx? · SWARA";
  }, []);

  return (
    <div className="sx" ref={root}>
      <nav className="sx-nav" aria-label="SWARA">
        <a className="sx-brand" href="/" aria-label="SWARA: home">
          <LogoMark size={22} />
          <Wordmark height={15} />
        </a>
        <a className="sx-pill" href={back.current}>
          <ArrowLeft aria-hidden="true" />
          <span>Back to the sky</span>
        </a>
      </nav>

      <header className="sx-hero">
        <div className="sx-hero-map" aria-hidden="true">
          <img src="/bundles/allsky/sky_D5.png" alt="" width={2048} height={1024} decoding="async" />
        </div>
        <div className="sx-hero-copy">
          <p className="sx-kick sx-in" style={{ ["--d" as string]: "0.05s" }}>
            The telescope behind SWARA
          </p>
          <h1 className="sx-in" style={{ ["--d" as string]: "0.15s" }}>
            What is SPHEREx?
          </h1>
          <p className="sx-lede sx-in" style={{ ["--d" as string]: "0.3s" }}>
            A NASA space telescope that maps the entire sky in infrared light. It does not take one picture of each place. It
            takes 102 colours of it.
          </p>
          <dl className="sx-stats sx-in" style={{ ["--d" as string]: "0.45s" }}>
            <div>
              <dt>Launched</dt>
              <dd>March 2025</dd>
            </div>
            <div>
              <dt>Colours</dt>
              <dd>102</dd>
            </div>
            <div>
              <dt>Light</dt>
              <dd>0.75 to 5.0 µm</dd>
            </div>
            <div>
              <dt>Whole sky</dt>
              <dd>every 6 months</dd>
            </div>
          </dl>
        </div>
        <p className="sx-hero-cap">
          Behind this text: the real SPHEREx all-sky map at 4.1 µm, Milky Way across the middle. NASA/JPL-Caltech/IPAC, SPHEREx
          DR1 via IRSA.
        </p>
      </header>

      <main>
        <Section id="what" n="I" kick="The mission" title="A map of the sky, in colour">
          <div className="sx-split">
            <div className="sx-copy" data-rise>
              <p>
                <b>SPHEREx</b> is a NASA mission led by Caltech and managed by JPL. It launched on 11 March 2025 (US time) and
                circles Earth from pole to pole, about 650 km up.
              </p>
              <p>It maps the whole sky every six months. Each spot gets a full infrared spectrum, not just a photo.</p>
              <p>
                Scientists use it to study how the universe began, how galaxies grew, and where the water ice for new planets is
                hiding.
              </p>
              <p className="sx-small">
                The name: Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer.
              </p>
            </div>
            <Figure
              src="/spherex/observatory.jpg"
              alt="Artist's illustration of the SPHEREx observatory: a wide cone of nested shields above a small spacecraft with solar panels."
              credit="Illustration: NASA/JPL-Caltech"
              w={1400}
              h={787}
            />
          </div>
        </Section>

        <Section id="how" n="II" kick="How it sees" title="One filter, many colours">
          <div className="sx-split sx-split-wide">
            <div className="sx-copy" data-rise>
              <p>
                Each detector sits behind a <b>linear variable filter</b>. The colour it lets through changes from one edge of the
                detector to the other.
              </p>
              <p>
                Between exposures the telescope turns a little. The same star then lands on a new strip and is seen in a new
                colour. Step by step, the strips add up to a spectrum.
              </p>
            </div>
            <div className="sx-diagram-wrap" data-rise>
              <LvfDiagram />
            </div>
          </div>
          <div className="sx-split sx-split-wide sx-split-flip">
            <div className="sx-copy" data-rise>
              <p>
                A beam splitter sends the light two ways. Shorter wavelengths go to three detectors, longer ones to three more.
              </p>
              <p>
                Six detectors, 17 colours each: <b>102 channels from 0.75 to 5.0 microns</b>.
              </p>
            </div>
            <div className="sx-diagram-wrap" data-rise>
              <SplitDiagram />
            </div>
          </div>
        </Section>

        <Section id="parts" n="III" kick="Its parts" title="Built to stay cold">
          <div className="sx-split">
            <Figure
              src="/spherex/parts.jpg"
              alt="Cutaway render of SPHEREx: three nested cone-shaped photon shields around the black telescope, above the white spacecraft body and solar panel."
              credit="Cutaway render: NASA. Markers I and II added by SWARA."
              w={1400}
              h={787}
              marks={[
                { n: "I", x: 62, y: 49, label: "Telescope" },
                { n: "II", x: 54, y: 21, label: "Photon shields" },
              ]}
            />
            <ol className="sx-parts" data-rise>
              <li>
                <h3>Telescope</h3>
                <p>A 20 cm mirror telescope with a very wide view, 3.5 by 11.3 degrees.</p>
              </li>
              <li>
                <h3>Photon shields</h3>
                <p>Three nested cones. They block heat and light from the Sun and Earth.</p>
              </li>
              <li>
                <h3>Cooling</h3>
                <p>No fridge, no coolant. Radiators shaped like V-grooves shed heat into space, down to about −210 °C.</p>
              </li>
              <li>
                <h3>Detectors</h3>
                <p>
                  Six infrared detectors, 2048 by 2048 pixels each. Cold keeps the telescope's own heat from drowning out faint
                  light.
                </p>
              </li>
            </ol>
          </div>
        </Section>

        <Section id="data" n="IV" kick="From orbit to you" title="How the data reaches us">
          <ol className="sx-flow" data-rise>
            <li>
              <span className="sx-flow-n">1</span>
              <h3>Observe</h3>
              <p>SPHEREx takes exposure after exposure as it sweeps the sky.</p>
            </li>
            <li>
              <span className="sx-flow-n">2</span>
              <h3>Downlink</h3>
              <p>A station in Antarctica receives it. Relay satellites pass it on to NASA's Near Space Network.</p>
            </li>
            <li>
              <span className="sx-flow-n">3</span>
              <h3>Process</h3>
              <p>IPAC at Caltech calibrates each image and marks bad or saturated pixels.</p>
            </li>
            <li>
              <span className="sx-flow-n">4</span>
              <h3>Release</h3>
              <p>Anyone can download it from NASA's IRSA archive. SWARA reads it from there.</p>
            </li>
          </ol>
          <Figure
            src="/spherex/downlink.jpg"
            alt="NASA graphic: SPHEREx sends data to the Troll antenna in Antarctica, then by satellite relay to the Near Space Network DAPHNE+ cloud, where it is collected."
            credit="Graphic: NASA"
            w={1400}
            h={787}
            className="sx-fig-wide"
          />
        </Section>

        <Section id="swara" n="V" kick="What you see in SWARA" title="Reading the lens">
          <ul className="sx-bands" data-rise aria-label="The six display bands, real SPHEREx all-sky maps">
            {BANDS.map((b, i) => (
              <li key={b.id} style={{ ["--k" as string]: i }}>
                <div className="sx-band-img">
                  <img
                    src={`/bundles/allsky/sky_${b.id}_small.png`}
                    alt=""
                    width={1024}
                    height={512}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <b>{b.id}</b>
                <span>
                  {b.lo.toFixed(2)} to {b.hi.toFixed(2)} µm
                </span>
              </li>
            ))}
          </ul>
          <p className="sx-cap" data-rise>
            The same sky in SWARA's six bands, from real SPHEREx all-sky maps.
            NASA/JPL-Caltech/IPAC, SPHEREx DR1 via IRSA.
          </p>
          <dl className="sx-facts" data-rise>
            <div>
              <dt>Visits</dt>
              <dd>
                SPHEREx passes over a spot about every six months. Each pass is one <b>visit</b>, with dozens of exposures. SWARA
                blinks visit to visit.
              </dd>
            </div>
            <div>
              <dt>Bands D1 to D6</dt>
              <dd>One band per detector. A frame in the lens is the median of a detector's exposures in one visit.</dd>
            </div>
            <div>
              <dt>6.15″ pixels</dt>
              <dd>
                Each pixel is about 6.2 arcseconds wide (6.15″ in the image files). A star moving a few arcseconds a year shifts
                about one pixel, so SWARA measures the centre of its light.
              </dd>
            </div>
            <div>
              <dt>Saturation</dt>
              <dd>
                Very bright stars overfill their pixels. Those pixels have no true value, so SWARA marks them in red and leaves
                them out.
              </dd>
            </div>
          </dl>
          <div className="sx-cta" data-rise>
            <a className="sx-btn" href={back.current}>
              <span>Open the sky</span>
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </Section>

        <section className="sx-sec sx-sources" id="sources" aria-labelledby="sources-h">
          <header className="sx-head" data-rise>
            <p className="sx-kick">Sources</p>
            <h2 id="sources-h">Where these facts come from</h2>
          </header>
          <ul data-rise>
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noreferrer">
                  <span>{s.title}</span>
                  <ArrowUpRight aria-hidden="true" />
                </a>
                <small>{s.note}</small>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="sx-foot">
        <span>SWARA · NASA Space Apps 2026. Image credits are under each image.</span>
        <a href="/">swara.space</a>
      </footer>
    </div>
  );
}
