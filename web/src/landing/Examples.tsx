import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { paint, type Rect } from "../lib/paint";
import { placeHref } from "../route";
import { EMBER, gaiaLine, imageOf, type Example } from "./data";
import { reveal, useInView, useTween } from "./hooks";

// Pemilih lima contoh: daftar di kiri, panggung di kanan. Menunjuk satu baris (atau
// mengetuknya) memindah bintang penanda ke baris itu, melarutkan lensa ke citranya, dan
// menghitung angkanya dari angka sebelumnya. Isinya dari bundle, seperti aplikasi.

const LENS_PX = 640;

function StageLens({ ex, on, load }: { ex: Example; on: boolean; load: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!load || !ex.image) return;
    let alive = true;
    imageOf(ex.image)
      .then((img) => {
        const c = ref.current;
        if (!alive || !c) return;
        // Setengah bagian tengah frame: medan 3 menit busur di sekitar benda itu.
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const view: Rect = { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 };
        paint(c, img, EMBER, LENS_PX, undefined, view);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [load, ex.image]);
  return <canvas ref={ref} className="lp-stage-lens" width={LENS_PX} height={LENS_PX} data-on={on} data-ready={ready} />;
}

export function Examples({ examples }: { examples?: Example[] }) {
  const [sectionRef, near] = useInView<HTMLElement>({ rootMargin: "600px 0px" });
  const [active, setActive] = useState(0);
  const [gaia, setGaia] = useState<Record<string, string | null>>({});
  const listRef = useRef<HTMLOListElement>(null);
  const nameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hoverTimer = useRef(0);
  const [star, setStar] = useState<{ x: number; y: number }>();
  const placed = useRef(false);

  const ex = examples?.[active];

  // Kalimat Gaia dimuat sekali per contoh.
  useEffect(() => {
    if (!ex || ex.ref.id in gaia) return;
    let alive = true;
    gaiaLine(ex)
      .then((line) => alive && setGaia((g) => ({ ...g, [ex.ref.id]: line ?? null })))
      .catch(() => alive && setGaia((g) => ({ ...g, [ex.ref.id]: null })));
    return () => {
      alive = false;
    };
  }, [ex, gaia]);

  // Bintang penanda berpindah ke nama baris yang aktif.
  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const name = nameRefs.current[active];
      const box = name?.parentElement;
      if (!list || !name || !box) return;
      // Letak tata letak (offset), bukan getBoundingClientRect: tetap benar saat daftar diperkecil
      // dengan zoom di layar pendek. Daftar adalah induk berposisi baris-barisnya.
      let x = 0;
      let y = 0;
      for (let el: HTMLElement | null = box; el && el !== list; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft;
        y += el.offsetTop;
      }
      const line = parseFloat(getComputedStyle(name).lineHeight) || name.offsetHeight;
      setStar({ x, y: y + line / 2 - 6.5 });
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, examples]);
  useEffect(() => {
    if (star) placed.current = true;
  }, [star]);

  const choose = (i: number) => {
    window.clearTimeout(hoverTimer.current);
    setActive(i);
  };
  // Menunjuk dengan mouse memilih setelah jeda pendek, supaya melintasi daftar tidak
  // membuat panggung berkedip.
  const lean = (i: number) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setActive(i), 90);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const value = useTween(ex?.value ?? 0, 900);
  const measured = ex ? ex.value !== undefined || ex.epithet === "The Still One" : false;
  const gaiaText = ex ? gaia[ex.ref.id] : undefined;

  return (
    <section ref={sectionRef} id="examples" className="lp-sec lp-examples" aria-labelledby="examples-title">
      <span ref={reveal} className="lp-kick lp-rise">
        Start with a star
      </span>
      <h2 ref={reveal} id="examples-title" className="lp-h2 lp-rise">
        Five places, already measured.
      </h2>
      <div className="lp-pick" data-ready={!!examples}>
        <ol ref={listRef} className="lp-rows" aria-label="Examples">
          {star && (
            <i
              className="lp-row-star"
              aria-hidden="true"
              style={{ transform: `translate(${star.x}px, ${star.y}px)`, transition: placed.current ? undefined : "none" }}
            />
          )}
          {examples?.map((item, i) => (
            <li key={item.ref.id} ref={reveal} className="lp-rise" style={{ "--d": `${i * 70}ms` } as CSSProperties}>
              <button
                type="button"
                className="lp-row"
                data-on={i === active}
                aria-pressed={i === active}
                onPointerEnter={(e) => e.pointerType === "mouse" && lean(i)}
                onPointerLeave={() => window.clearTimeout(hoverTimer.current)}
                onFocus={() => choose(i)}
                onClick={() => choose(i)}
              >
                <span className="lp-row-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="lp-row-nm">
                  <span
                    ref={(el) => {
                      nameRefs.current[i] = el;
                    }}
                    className="lp-row-name"
                  >
                    {item.ref.name}
                  </span>
                  <small>{item.epithet}</small>
                </span>
                <span className="lp-row-ms">{item.short}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* Pembaca layar mendengar satu ringkasan per pilihan, bukan angka yang sedang menghitung. */}
        <p className="sr-only" aria-live="polite">
          {ex ? `${ex.ref.name}, ${ex.epithet}: ${ex.big}, ${ex.line}.${gaiaText ? ` ${gaiaText}.` : ""}` : ""}
        </p>
        <div ref={reveal} className="lp-stage lp-rise">
          <i className="lp-br lp-br-tl" aria-hidden="true" />
          <i className="lp-br lp-br-tr" aria-hidden="true" />
          <i className="lp-br lp-br-bl" aria-hidden="true" />
          <i className="lp-br lp-br-br" aria-hidden="true" />
          <div className="lp-stage-optic" aria-hidden="true">
            {examples?.map((item, i) => (
              <StageLens key={item.ref.id} ex={item} on={i === active} load={near} />
            ))}
            <i className="lp-stage-ring" />
          </div>
          {ex && (
            <div className="lp-stage-foot">
              <div className="lp-stage-read">
                <span key={`l-${ex.ref.id}`} className="lp-stage-lab lp-swap">
                  {ex.epithet} · {measured ? "measured" : "not measured"}
                </span>
                <b className="lp-stage-big">{ex.value !== undefined ? `${value.toFixed(1)}″` : ex.big}</b>
                <span key={`t-${ex.ref.id}`} className="lp-stage-line lp-swap">
                  {ex.line}
                  {gaiaText && (
                    <>
                      <br />
                      {gaiaText}
                    </>
                  )}
                </span>
              </div>
              <a className="lp-btn lp-btn-primary lp-stage-go" href={placeHref(ex.ref.id)}>
                Open {ex.ref.name}
                <ArrowRight weight="bold" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
