import { ArrowRight, DownloadSimple, LinkSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LogoMark, MARK_STAR, Wordmark } from "../components/Logo";
import { CARD_H, CARD_TITLE, CARD_W, cardKinds, drawCard, SKINS, type CardKind, type RGB } from "../lib/card";
import { CardNotReady, KIND_SLUG, kindFromSlug, loadCardInput, type CardLoad, type CardPlace } from "../lib/cardData";
import { prefersReducedMotion } from "../lib/hooks";
import { isPalette, LUTS, type PaletteId } from "../lib/palette";
import { paintPatch, patchAt, patchPoint, placeFacts } from "../lib/reading";
import { verdict } from "../lib/verdict";
import { APP_PATH } from "../route";
import "./card.css";

// Halaman satu kartu: tujuan tautan berbagi. Isinya hanya kartu itu, melayang di langit
// tempat bendanya berada, dan dua jalan keluar: membuka tempat itu, atau menarik kartu sendiri.
//
// Yang di belakang kartu bukan hiasan karangan: langitnya petak peta SPHEREx yang asli di
// sekitar benda itu, dan garisnya rasi yang memang ada di sana. Yang murni hiasan hanya
// cincin alat, debu cahaya, dan kilau kartu (lihat web/DESIGN.md, "Halaman kartu").

const QUERY = new URLSearchParams(window.location.search);
const num = (key: string) => {
  const raw = QUERY.get(key);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? v : undefined;
};
const PLACE: CardPlace = {
  target: QUERY.get("target") ?? undefined,
  ra: num("ra"),
  dec: num("dec"),
  name: QUERY.get("name")?.trim().slice(0, 80) || undefined,
};
const LOOK: PaletteId = isPalette(QUERY.get("look")) ? (QUERY.get("look") as PaletteId) : "heat";
const WANTED = kindFromSlug(QUERY.get("card"));

const NUMERAL = ["I", "II", "III"];
const TURN_MS = 520;
const css = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`;

type Status = "loading" | "ready" | "notready" | "error";

/** Kalimat di samping kartu: apa yang sedang dilihat, dalam satu napas. */
function sideText(load: CardLoad, kind: CardKind): { kicker: string; line: string; note: string } {
  const { input, id, custom } = load;
  const m = input.manifest;
  if (kind === "voice")
    return {
      kicker: "Its light",
      line: "Its light, split into colours no eye can see.",
      note: "Each ray is one measurement by SPHEREx, from 0.75 to 5 µm. The longer the ray, the brighter.",
    };
  if (kind === "place" && input.sky) {
    const f = placeFacts(input.sky.atlas, m.ra, m.dec);
    return { kicker: "Its place", line: `It lives in ${f.constellation}.`, note: `${f.plane} ${f.visible}` };
  }
  const v = verdict(m, id, custom);
  const n = input.wiseImages.length;
  const looks = n ? `${n} pictures by WISE since 2010, then ${m.windows.length} visits by SPHEREx.` : `${m.windows.length} visits by SPHEREx.`;
  if (input.blended)
    return {
      kicker: v.epithet,
      line: "Hidden behind a background star.",
      note: `${looks} SPHEREx could not separate it from that star, so nothing here is measured.`,
    };
  const line =
    v.epithet === "The Wanderer"
      ? `It moved ${v.big} ${v.line}.`
      : v.epithet === "The Still One"
        ? "It held still while SPHEREx watched."
        : v.line === "too bright to track"
          ? "Too bright for SPHEREx to track."
          : "SPHEREx could not track it.";
  return { kicker: v.epithet, line, note: `${looks} Each ray on the arc is one of those looks.` };
}

export function CardPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<() => void>(() => undefined);

  const [status, setStatus] = useState<Status>("loading");
  const [load, setLoad] = useState<CardLoad>();
  const [kind, setKind] = useState<CardKind>();
  /** Jumlah setengah putaran: ganjil berarti punggung kartu menghadap kita. */
  const [turn, setTurn] = useState(1);
  const [arrived, setArrived] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);

  const kinds = useMemo(() => (load ? cardKinds(load.input) : []), [load]);
  const skin = SKINS[LOOK];

  useEffect(() => {
    let alive = true;
    loadCardInput(PLACE, LOOK)
      .then((l) => {
        if (!alive) return;
        const all = cardKinds(l.input);
        if (!all.length) throw new Error("no card for this place");
        setLoad(l);
        setKind(WANTED && all.includes(WANTED) ? WANTED : all[0]);
      })
      .catch((err) => {
        if (!alive) return;
        if (!(err instanceof CardNotReady)) console.error(err);
        setStatus(err instanceof CardNotReady ? "notready" : "error");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Kartu pertama: dilukis selagi masih tertelungkup, lalu dibalik.
  const first = useRef(true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!load || !kind || !canvas || !first.current) return;
    first.current = false;
    let alive = true;
    let timer = 0;
    drawCard(canvas, kind, load.input)
      .then(() => {
        if (!alive) return;
        setStatus("ready");
        document.title = `${load.input.name}: a card from the sky · SWARA`;
        const calm = prefersReducedMotion();
        timer = window.setTimeout(
          () => {
            setTurn(2);
            setArrived(true);
            if (!calm) window.setTimeout(() => burstRef.current(), TURN_MS * 0.55);
          },
          calm ? 0 : 900,
        );
      })
      .catch((err) => {
        console.error(err);
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [load, kind]);

  // Ganti kartu: balik ke punggung, lukis kartu berikutnya, balik lagi.
  const show = useCallback(
    (next: CardKind) => {
      const canvas = canvasRef.current;
      if (!load || !canvas || busy.current || next === kind || status !== "ready") return;
      busy.current = true;
      const calm = prefersReducedMotion();
      setTurn((t) => t + 1);
      window.setTimeout(
        () => {
          void drawCard(canvas, next, load.input)
            .catch((err) => console.error(err))
            .then(() => {
              setKind(next);
              setTurn((t) => t + 1);
              if (!calm) window.setTimeout(() => burstRef.current(), TURN_MS * 0.55);
              window.setTimeout(() => (busy.current = false), TURN_MS);
            });
        },
        calm ? 0 : TURN_MS,
      );
      const q = new URLSearchParams(window.location.search);
      q.set("card", KIND_SLUG[next]);
      window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    },
    [load, kind, status],
  );
  const nextCard = () => {
    if (kinds.length > 1 && kind) show(kinds[(kinds.indexOf(kind) + 1) % kinds.length]);
  };

  // Langit di belakang: petak peta SPHEREx yang asli di sekitar benda, dan rasi di sana.
  const sky = load?.input.sky;
  const ra = load?.input.manifest.ra;
  const dec = load?.input.manifest.dec;
  useEffect(() => {
    const skyCanvas = skyRef.current;
    const lines = linesRef.current;
    if (!sky || ra === undefined || dec === undefined || !skyCanvas || !lines) return;
    const paint = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const wide = w >= h;
      const deg = wide ? 104 : 58;
      // Peta aslinya sekitar 7 menit busur per piksel; petak kecil sudah cukup tajam.
      const sw = wide ? 720 : 400;
      const sh = Math.round((sw * h) / w);
      paintPatch(skyCanvas, sky.gray, sky.atlas, patchAt(ra, dec, sw, sh, deg), LUTS[LOOK === "paper" ? "gray" : LOOK]);

      const px = Math.min(2, window.devicePixelRatio || 1);
      lines.width = Math.round(w * px);
      lines.height = Math.round(h * px);
      const ctx = lines.getContext("2d")!;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const patch = patchAt(ra, dec, w, h, deg);
      const home = placeFacts(sky.atlas, ra, dec).abbr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [abbr, parts] of Object.entries(sky.atlas.constellations.lines)) {
        const mine = abbr === home;
        ctx.strokeStyle = `rgb(${css(mine ? skin.hi : skin.gold)} / ${mine ? 0.5 : 0.13})`;
        ctx.lineWidth = mine ? 1.3 : 1;
        for (const part of parts) {
          const pts = part.map(([r, d]) => patchPoint(patch, r, d));
          if (pts.some((p) => !p)) continue;
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(p!.x, p!.y) : ctx.moveTo(p!.x, p!.y)));
          ctx.stroke();
          if (mine) {
            ctx.fillStyle = `rgb(${css(skin.hi)} / 0.85)`;
            for (const p of pts) {
              ctx.beginPath();
              ctx.arc(p!.x, p!.y, 2.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    };
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [sky, ra, dec, skin]);

  // Satu putaran animasi: kemiringan kartu mengikuti penunjuk, debu cahaya, dan percikan.
  useEffect(() => {
    const root = rootRef.current;
    const canvas = dustRef.current;
    if (!root || !canvas) return;
    const calm = prefersReducedMotion();
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    const size = () => {
      const px = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * px);
      canvas.height = Math.round(h * px);
      ctx.setTransform(px, 0, 0, px, 0, 0);
    };
    size();

    type Mote = { x: number; y: number; r: number; v: number; sway: number; phase: number };
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number; r: number };
    const motes: Mote[] = Array.from({ length: calm ? 0 : 54 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.9,
      v: 0.006 + Math.random() * 0.016,
      sway: 6 + Math.random() * 16,
      phase: Math.random() * 6.28,
    }));
    let sparks: Spark[] = [];
    burstRef.current = () => {
      const box = cardRef.current?.getBoundingClientRect();
      if (!box || calm) return;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      for (let i = 0; i < 46; i++) {
        // Percikan lahir di tepi kartu dan terbang menjauh dari tengahnya.
        const side = Math.random() * 4;
        const t = Math.random();
        const x = side < 1 ? box.left + t * box.width : side < 2 ? box.right : side < 3 ? box.left + t * box.width : box.left;
        const y = side < 1 ? box.top : side < 2 ? box.top + t * box.height : side < 3 ? box.bottom : box.top + t * box.height;
        const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.9;
        const speed = 40 + Math.random() * 150;
        sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.7 + Math.random() * 0.9, age: 0, r: 2.5 + Math.random() * 5 });
      }
    };

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let touched = -1e9;
    const point = (e: PointerEvent) => {
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
      touched = performance.now();
    };
    // Ponsel yang memberi arah tanpa minta izin (Android): kartu ikut miringnya tangan.
    const tiltDevice = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 28));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
      touched = performance.now();
    };
    if (!calm) {
      window.addEventListener("pointermove", point);
      window.addEventListener("pointerdown", point);
      window.addEventListener("deviceorientation", tiltDevice);
    }
    window.addEventListener("resize", size);

    const gold = css(skin.gold);
    const hi = css(skin.hi);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Tanpa penunjuk, kartu bernapas sendiri.
      if (now - touched > 2600) {
        tx = Math.sin(now / 2300) * 0.42;
        ty = Math.cos(now / 3100) * 0.3;
      }
      x += (tx - x) * Math.min(1, dt * 5);
      y += (ty - y) * Math.min(1, dt * 5);
      root.style.setProperty("--tx", x.toFixed(4));
      root.style.setProperty("--ty", y.toFixed(4));

      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= m.v * dt;
        if (m.y < -0.03) {
          m.y = 1.03;
          m.x = Math.random();
        }
        const mx = m.x * w + Math.sin(now / 1900 + m.phase) * m.sway - x * m.r * 9;
        const my = m.y * h - y * m.r * 6;
        ctx.globalAlpha = (0.16 + 0.22 * (0.5 + 0.5 * Math.sin(now / 900 + m.phase * 3))) * Math.min(1, m.r / 1.6);
        ctx.fillStyle = `rgb(${gold})`;
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      sparks = sparks.filter((s) => s.age < s.life);
      for (const s of sparks) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - dt * 1.6;
        s.vy *= 1 - dt * 1.6;
        const k = 1 - s.age / s.life;
        const r = s.r * (0.4 + 0.6 * k);
        const q = r * 0.2;
        ctx.globalAlpha = k;
        ctx.fillStyle = `rgb(${hi})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + q, s.y - q);
        ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x + q, s.y + q);
        ctx.lineTo(s.x, s.y + r);
        ctx.lineTo(s.x - q, s.y + q);
        ctx.lineTo(s.x - r, s.y);
        ctx.lineTo(s.x - q, s.y - q);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    if (!calm) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", point);
      window.removeEventListener("pointerdown", point);
      window.removeEventListener("deviceorientation", tiltDevice);
      window.removeEventListener("resize", size);
    };
  }, [skin]);

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !load || !kind) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = load.input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sky";
      a.href = url;
      a.download = `swara-${slug}-${KIND_SLUG[kind]}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  };
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  const text = load && kind ? sideText(load, kind) : undefined;
  const at = kind ? kinds.indexOf(kind) : 0;
  const vars = {
    "--gold": css(skin.gold),
    "--hi": css(skin.hi),
    "--lo": css(skin.lo),
    "--glow": css(skin.glow ?? skin.gold),
    "--back-top": css(LOOK === "paper" ? SKINS.heat.top : skin.top),
    "--back-bottom": css(LOOK === "paper" ? SKINS.heat.bottom : skin.bottom),
    "--turn": turn,
  } as CSSProperties;

  return (
    <div ref={rootRef} className="cp" style={vars} data-status={status} data-arrived={arrived}>
      <div className="cp-sky" aria-hidden="true">
        <canvas ref={skyRef} className="cp-sky-map" data-on={!!sky} />
        <canvas ref={linesRef} className="cp-sky-lines" data-on={!!sky} />
      </div>
      <canvas ref={dustRef} className="cp-dust" aria-hidden="true" />

      <header className="cp-top">
        <a className="cp-brand" href="/" aria-label="SWARA, home">
          <LogoMark size={24} />
          <Wordmark height={15} />
        </a>
        <a className="cp-top-link" href={APP_PATH}>
          Open the sky
          <ArrowRight weight="bold" aria-hidden="true" />
        </a>
      </header>

      <main className="cp-main">
        <div className="cp-scene">
          <svg className="cp-rings" viewBox="-500 -500 1000 1000" aria-hidden="true">
            <g className="cp-ring cp-ring-a">
              <circle r="470" />
              {Array.from({ length: 48 }, (_, i) => {
                const a = (i * 7.5 * Math.PI) / 180;
                const major = i % 6 === 0;
                const r1 = major ? 440 : i % 2 === 0 ? 452 : 458;
                return <line key={i} data-major={major} x1={Math.cos(a) * 470} y1={Math.sin(a) * 470} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1} />;
              })}
            </g>
            <g className="cp-ring cp-ring-b">
              <circle r="402" strokeDasharray="2 14" />
              {[0, 90, 180, 270].map((a) => (
                <path key={a} d={MARK_STAR} transform={`rotate(${a}) translate(0 -402) scale(0.75) translate(-32 -32)`} />
              ))}
            </g>
          </svg>

          <div className="cp-float">
            <div ref={cardRef} className="cp-card">
              <span className="cp-flip">
                <span className="cp-face cp-front">
                  <canvas ref={canvasRef} width={CARD_W} height={CARD_H} />
                  <i className="cp-sheen" aria-hidden="true" />
                </span>
                <span className="cp-face cp-back" aria-hidden="true">
                  <svg viewBox="0 0 270 480">
                    <rect x="12" y="12" width="246" height="456" rx="10" className="cp-back-line" />
                    <rect x="19" y="19" width="232" height="442" rx="6" className="cp-back-fine" />
                    <g transform="translate(135 240)">
                      <circle r="86" className="cp-back-fine" />
                      <circle r="70" className="cp-back-line" />
                      {Array.from({ length: 24 }, (_, i) => {
                        const a = (i * 15 * Math.PI) / 180;
                        return <line key={i} className="cp-back-fine" x1={Math.cos(a) * 86} y1={Math.sin(a) * 86} x2={Math.cos(a) * (i % 6 === 0 ? 104 : 94)} y2={Math.sin(a) * (i % 6 === 0 ? 104 : 94)} />;
                      })}
                      <path d={MARK_STAR} transform="scale(2.4) translate(-32 -32)" className="cp-back-star" />
                    </g>
                    {[
                      [135, 62],
                      [135, 418],
                    ].map(([x, y]) => (
                      <path key={y} d={MARK_STAR} transform={`translate(${x} ${y}) scale(0.42) translate(-32 -32)`} className="cp-back-star" />
                    ))}
                  </svg>
                </span>
              </span>
              {/* Tombolnya lapisan rata di atas kartu: isi tiga dimensi di dalam <button> tidak
                  digambar sama di semua browser. */}
              <button
                type="button"
                className="cp-hit"
                onClick={nextCard}
                disabled={status !== "ready" || kinds.length < 2}
                aria-label={
                  load && kind
                    ? `Card ${NUMERAL[at]} of ${load.input.name}: ${CARD_TITLE[kind].toLowerCase()}.${kinds.length > 1 ? " Press to turn to the next card." : ""}`
                    : "A card is being drawn"
                }
              />
            </div>
          </div>
          <i className="cp-shadow" aria-hidden="true" />
        </div>

        <div className="cp-side">
          {status === "loading" && (
            <p className="cp-wait" role="status">
              A card is being drawn…
            </p>
          )}
          {status === "notready" && (
            <div className="cp-text" data-in="true">
              <span className="cp-kicker">Not drawn yet</span>
              <h1>This place is still being collected.</h1>
              <p className="cp-note">SWARA is still reading this patch of sky from NASA's archive. Open it to watch it arrive.</p>
              <div className="cp-actions">
                <a className="cp-btn cp-btn-main" href={`${APP_PATH}${window.location.search}`}>
                  Open this place
                  <ArrowRight weight="bold" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="cp-text" data-in="true">
              <span className="cp-kicker">No card here</span>
              <h1>This card could not be drawn.</h1>
              <p className="cp-note">The link may be incomplete, or the archive is not answering. The sky itself is still open.</p>
              <div className="cp-actions">
                <a className="cp-btn cp-btn-main" href={APP_PATH}>
                  Open the sky
                  <ArrowRight weight="bold" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
          {status === "ready" && load && kind && text && (
            <div className="cp-text" data-in={arrived}>
              <span key={`k-${kind}`} className="cp-kicker cp-swap">
                A card from the sky · {text.kicker}
              </span>
              <h1 data-long={load.input.name.length > 15}>{load.input.name}</h1>
              <p key={`l-${kind}`} className="cp-line cp-swap">
                {text.line}
              </p>
              <p key={`n-${kind}`} className="cp-note cp-swap">
                {text.note}
              </p>

              {kinds.length > 1 && (
                <div className="cp-kinds" role="group" aria-label="Which card">
                  {kinds.map((k, i) => (
                    <button key={k} type="button" aria-pressed={k === kind} onClick={() => show(k)}>
                      <b aria-hidden="true">{NUMERAL[i]}</b>
                      {CARD_TITLE[k]}
                    </button>
                  ))}
                </div>
              )}

              <div className="cp-actions">
                <a className="cp-btn cp-btn-main" href={load.input.url}>
                  Explore this place
                  <ArrowRight weight="bold" aria-hidden="true" />
                </a>
                <a className="cp-btn" href={APP_PATH}>
                  Draw your own card
                </a>
              </div>
              <div className="cp-tools">
                <button type="button" onClick={save}>
                  <DownloadSimple aria-hidden="true" />
                  Save for stories
                </button>
                <button type="button" onClick={copy}>
                  <LinkSimple aria-hidden="true" />
                  <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="cp-foot">Drawn from real data: NASA SPHEREx and WISE, via IRSA and WiseView</footer>
    </div>
  );
}
