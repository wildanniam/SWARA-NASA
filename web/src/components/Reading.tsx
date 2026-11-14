import { ArrowsClockwise, Keyboard, ShareNetwork, StarFour, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { atlasUrl, decDms, raHms, toMap, type Atlas } from "../lib/allsky";
import { defaultBand, findFrame, type Manifest } from "../lib/bundle";
import { colorize, measured, SKINS, stackBrightest, type CardInput } from "../lib/card";
import { coord, dayMonthYear, microns, monthYear } from "../lib/format";
import { useDialog } from "../lib/hooks";
import { preload, useImageStore } from "../lib/images";
import { lookGradient, LOOKS, LUTS, type PaletteId } from "../lib/palette";
import {
  lightFacts,
  paintPatch,
  patchAt,
  patchPoint,
  pathFacts,
  placeFacts,
  SPHEREX_PIXEL_ARCSEC,
  type PlaceFacts,
} from "../lib/reading";
import { loadGray, paintSky } from "../lib/skyimage";
import { fluxLabel, LAMBDA_MAX, LAMBDA_MIN } from "../lib/spectrum";

export type ReadingPlace = {
  name: string;
  /** "Moves", "Changes brightness", "Your search", "Your coordinates". */
  kind: string;
  note: string;
  ra: number;
  dec: number;
  manifest?: Manifest;
  /** Bahan kartu berbagi: citra yang sudah termuat, spektrum, dan penanda benda yang tidak terpisah. */
  input?: CardInput;
  asset: (path: string) => string;
  blended?: string;
  cataloguePm?: number | null;
  spectrumPending: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  look: PaletteId;
  atlas?: Atlas;
  /** Ada kalau yang tampil adalah seluruh langit: satu kartu untuk petanya. */
  sky?: { band: string; places: { name: string; ra: number; dec: number }[] };
  place?: ReadingPlace;
  canShare: boolean;
  onShare: () => void;
  onWholeSky: () => void;
};

// Satuan kartu: 360 x 640, sepertiga kartu berbagi. Gambar tiap kartu 300 satuan lebarnya.
const W = 360;
const H = 640;
const ART_W = 300;
const ART_H = 270;

const polar = (cx: number, cy: number, deg: number, r: number): [number, number] => [
  cx + Math.cos((deg * Math.PI) / 180) * r,
  cy + Math.sin((deg * Math.PI) / 180) * r,
];
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const year = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25;

/** Bintang empat sudut: satu-satunya bintang hiasan, tidak pernah di dalam jendela data. */
function sparkle(x: number, y: number, r: number, k = 0.2): string {
  const q = r * k;
  return `M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}Z`;
}

/** Irisan cincin antara dua sudut: daerah sentuh satu sinar. */
function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  return `M${pt(polar(cx, cy, a0, r0))}L${pt(polar(cx, cy, a0, r1))}A${r1} ${r1} 0 0 1 ${pt(polar(cx, cy, a1, r1))}L${pt(polar(cx, cy, a1, r0))}A${r0} ${r0} 0 0 0 ${pt(polar(cx, cy, a0, r0))}Z`;
}

/** Bingkai kartu: garis ganda dengan sudut cekung, sebaris titik, dan dua bintang di sisi. */
function CardFrame() {
  const i1 = 12.67;
  const r1 = 10;
  const i2 = 17.33;
  const r2 = 15.33;
  const i3 = 22.67;
  const reach = Math.sqrt(r2 * r2 - (i2 - i1) ** 2);
  const ring = (inset: number, r: number, from: number) =>
    `M${from} ${inset}H${W - from}A${r} ${r} 0 0 0 ${W - inset} ${from}V${H - from}A${r} ${r} 0 0 0 ${W - from} ${H - inset}H${from}A${r} ${r} 0 0 0 ${inset} ${H - from}V${from}A${r} ${r} 0 0 0 ${from} ${inset}Z`;
  return (
    <svg className="tcard-frame" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path className="f-gold" d={ring(i1, r1, i1 + r1)} />
      <path className="f-lo" d={ring(i2, r2, i1 + reach)} />
      <path
        className="f-dots"
        d={`M${i3 + 14} ${i3}H${W - i3 - 14}M${i3 + 14} ${H - i3}H${W - i3 - 14}M${i3} ${i3 + 14}V${H / 2 - 12}M${i3} ${H / 2 + 12}V${H - i3 - 14}M${W - i3} ${i3 + 14}V${H / 2 - 12}M${W - i3} ${H / 2 + 12}V${H - i3 - 14}`}
      />
      <path className="f-star" d={sparkle(i3, H / 2, 4.6) + sparkle(W - i3, H / 2, 4.6)} />
    </svg>
  );
}

/** Pita julukan. Nama yang panjang dikecilkan sampai muat. */
function Ribbon({ text, dim }: { text: string; dim?: boolean }) {
  const size = text.length > 13 ? Math.max(9.5, (15 * 13) / text.length) : 15;
  return (
    <svg className="tcard-ribbon" data-dim={dim} viewBox="0 0 280 30" aria-hidden="true">
      <path className="r-body" d="M1 1H279L269 15L279 29H1L11 15Z" />
      <path className="r-rule" d="M18 4.5H262M18 25.5H262" />
      <text x="140" y="20.4" textAnchor="middle" style={{ fontSize: size }}>
        {text}
      </text>
    </svg>
  );
}

type ShellProps = {
  index: number;
  numeral: string;
  hook: string;
  /** Nama kartu untuk pembaca layar dan kepala sisi belakang. */
  title: string;
  flipped: boolean;
  onFlip: () => void;
  front: ReactNode;
  back: ReactNode;
  /** Tombol tambahan di kaki sisi depan. */
  action?: ReactNode;
  /** Kartu yang datanya tidak bisa dibaca tampil tertelungkup. */
  down?: boolean;
};

function Card({ index, numeral, hook, title, flipped, onFlip, front, back, action, down }: ShellProps) {
  return (
    <article className="tcard" style={{ "--i": index } as CSSProperties} data-flipped={flipped} data-down={down} aria-label={title}>
      <div className="tcard-inner">
        <div className="tcard-face tcard-front" inert={flipped}>
          <CardFrame />
          <header className="tcard-head">
            <span className="tcard-numeral">
              <i aria-hidden="true" />
              {numeral}
              <i aria-hidden="true" />
            </span>
            <span className="tcard-hook">{hook}</span>
          </header>
          {front}
          <footer className="tcard-foot">
            <button type="button" className="pill pill-etched" onClick={onFlip}>
              <ArrowsClockwise aria-hidden="true" />
              The data
            </button>
            {action}
          </footer>
        </div>
        <div className="tcard-face tcard-back" inert={!flipped}>
          <CardFrame />
          <header className="tcard-head">
            <span className="tcard-numeral">
              <i aria-hidden="true" />
              {numeral}
              <i aria-hidden="true" />
            </span>
            <span className="tcard-hook">{title} · the data</span>
          </header>
          <div className="tcard-data">{back}</div>
          <footer className="tcard-foot">
            <button type="button" className="pill pill-etched" onClick={onFlip}>
              <ArrowsClockwise aria-hidden="true" />
              Turn back
            </button>
          </footer>
        </div>
      </div>
    </article>
  );
}

/** Satu fakta: tanda kecil di kiri, satu kalimat di kanan. */
function Fact({ glyph, children }: { glyph: ReactNode; children: ReactNode }) {
  return (
    <li>
      <span className="tcard-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Sisi depan kartu yang tertelungkup: pola punggung kartu dan alasan kenapa tidak terbaca. */
function FaceDown({ why, counts }: { why: string; counts?: string }) {
  const cx = ART_W / 2;
  const cy = ART_H / 2;
  return (
    <>
      <div className="tcard-art">
        <svg viewBox={`0 0 ${ART_W} ${ART_H}`} aria-hidden="true">
          {[46, 70, 94, 118].map((r) => (
            <circle key={r} className={r === 94 ? "a-dots" : "a-lo"} cx={cx} cy={cy} r={r} />
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} className="a-lo" d={`M${pt(polar(cx, cy, i * 30, 46))}L${pt(polar(cx, cy, i * 30, 70))}`} />
          ))}
          <path className="a-star" d={sparkle(cx, cy, 26, 0.16)} />
          <path className="a-star" d={sparkle(cx, cy - 106, 5) + sparkle(cx, cy + 106, 5) + sparkle(cx - 106, cy, 5) + sparkle(cx + 106, cy, 5)} />
        </svg>
      </div>
      <p className="tcard-caption">This card stays face down</p>
      <Ribbon text="UNREAD" dim />
      <p className="tcard-say">{why}</p>
      {counts && (
        <ul className="tcard-facts">
          <Fact
            glyph={
              <svg viewBox="-20 -20 40 40">
                <circle className="g-lo" r="11" />
                <path className="g-lo" d="M-8 8L8 -8" />
              </svg>
            }
          >
            {counts}
          </Fact>
        </ul>
      )}
    </>
  );
}

// ---------- I. Tempatnya ----------

const PATCH_DEG = 44;
const P_X = 50;
const P_Y = 4;
const P_W = 200;
const P_H = 262;

function PlaceArt({ atlas, facts, ra, dec, look }: { atlas: Atlas; facts: PlaceFacts; ra: number; dec: number; look: PaletteId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);
  const band = atlas.frames.find((f) => f.band === atlas.default_band) ?? atlas.frames[0];

  useEffect(() => {
    let alive = true;
    loadGray(atlasUrl(band.image))
      .then((gray) => {
        if (!alive || !canvas.current) return;
        paintPatch(canvas.current, gray, atlas, patchAt(ra, dec, P_W * 2, P_H * 2, PATCH_DEG), LUTS[look]);
        setShown(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [atlas, band, ra, dec, look]);

  // Garis rasi: yang ditempati benda ini digambar terang, tetangganya tipis.
  const lines = useMemo(() => {
    const patch = patchAt(ra, dec, P_W, P_H, PATCH_DEG);
    const path = (abbr: string) =>
      (atlas.constellations.lines[abbr] ?? [])
        .map((line) => {
          let d = "";
          let pen = false;
          for (const [r, de] of line) {
            const p = patchPoint(patch, r, de);
            // Yang jauh di luar jendela tidak perlu digambar; garisnya diputus di situ.
            if (!p || p.x < -80 || p.x > P_W + 80 || p.y < -80 || p.y > P_H + 80) {
              pen = false;
              continue;
            }
            d += `${pen ? "L" : "M"}${(p.x + P_X).toFixed(1)} ${(p.y + P_Y).toFixed(1)}`;
            pen = true;
          }
          return d;
        })
        .join("");
    const others = Object.keys(atlas.constellations.lines)
      .filter((a) => a !== facts.abbr)
      .map(path)
      .join("");
    return { home: path(facts.abbr), others };
  }, [atlas, facts.abbr, ra, dec]);

  const cx = P_X + P_W / 2;
  const cy = P_Y + P_H / 2;
  const r = P_W / 2;
  const arch = (grow: number) =>
    `M${P_X - grow} ${P_Y + P_H}V${P_Y + r}A${r + grow} ${r + grow} 0 0 1 ${P_X + P_W + grow} ${P_Y + r}V${P_Y + P_H}`;
  return (
    <div className="tcard-art">
      <canvas
        ref={canvas}
        className="art-window art-arch"
        data-shown={shown}
        style={{
          left: `${(P_X / ART_W) * 100}%`,
          top: `${(P_Y / ART_H) * 100}%`,
          width: `${(P_W / ART_W) * 100}%`,
          height: `${(P_H / ART_H) * 100}%`,
          borderRadius: `50% 50% 0 0 / ${((r / P_H) * 100).toFixed(2)}% ${((r / P_H) * 100).toFixed(2)}% 0 0`,
        }}
        role="img"
        aria-label={`The sky around this place in ${facts.constellation}, from the SPHEREx all-sky map, with the constellation figure drawn over it.`}
      />
      <svg viewBox={`0 0 ${ART_W} ${ART_H}`} aria-hidden="true">
        <defs>
          <clipPath id="place-arch">
            <path d={`${arch(0)}Z`} />
          </clipPath>
        </defs>
        <g clipPath="url(#place-arch)">
          <path className="a-figure-far" d={lines.others} />
          <path className="a-figure" d={lines.home} />
          <circle className="a-pulse" cx={cx} cy={cy} r="7" />
          <circle className="a-here" cx={cx} cy={cy} r="7" />
          <circle className="a-here-dot" cx={cx} cy={cy} r="1.8" />
          <text className="a-label a-halo" x={cx} y={P_Y + 24} textAnchor="middle">
            N
          </text>
        </g>
        <path className="a-hi" d={arch(0)} />
        <path className="a-lo" d={arch(4)} />
        <text className="a-label" x={P_X - 22} y={cy + 4} textAnchor="middle">
          E
        </text>
        <text className="a-label" x={P_X + P_W + 22} y={cy + 4} textAnchor="middle">
          W
        </text>
        <path className="a-lo" d={`M${P_X - 12} ${cy}h6M${P_X + P_W + 6} ${cy}h6`} />
      </svg>
    </div>
  );
}

/** Peta seluruh langit mini dengan satu titik: di mana tempat ini di seluruh langit. */
function Locator({ atlas, ra, dec, look }: { atlas: Atlas; ra: number; dec: number; look: PaletteId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const band = atlas.frames.find((f) => f.band === atlas.default_band) ?? atlas.frames[0];
  useEffect(() => {
    let alive = true;
    loadGray(atlasUrl(band.small))
      .then((gray) => alive && canvas.current && paintSky(canvas.current, gray, LUTS[look]))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [band, look]);
  const at = toMap(atlas, ra, dec);
  return (
    <span className="locator">
      <canvas ref={canvas} />
      <i style={{ left: `${(at.x / atlas.projection.width) * 100}%`, top: `${(at.y / atlas.projection.height) * 100}%` }} />
    </span>
  );
}

function placeBack(atlas: Atlas | undefined, facts: PlaceFacts | undefined, ra: number, dec: number) {
  const band = atlas?.frames.find((f) => f.band === atlas.default_band) ?? atlas?.frames[0];
  return (
    <>
      <dl className="facts">
        <dt>Centre</dt>
        <dd>
          {raHms(ra)}, {decDms(dec)}
          <br />
          {coord(ra, dec)}
        </dd>
        {facts && (
          <>
            <dt>Constellation</dt>
            <dd>
              {facts.constellation} ({facts.abbr}), by the official IAU boundaries
            </dd>
            <dt>Galactic latitude</dt>
            <dd>
              {facts.b >= 0 ? "+" : "−"}
              {Math.abs(facts.b).toFixed(1)}°
            </dd>
          </>
        )}
        <dt>Picture</dt>
        <dd>
          SPHEREx DR1 all-sky map{band ? ` at ${band.lambda_um.toFixed(2)} µm` : ""}, {PATCH_DEG}° across, north up, east left
        </dd>
        <dt>Figures</dt>
        <dd>Traditional constellation figures from d3-celestial by Olaf Frohn</dd>
      </dl>
      <p>Nothing is measured from this map. It only shows where the place is.</p>
    </>
  );
}

// ---------- II. Jalannya ----------

const A_CX = 150;
const A_CY = 124;
const A_R = 86;
const A_BOTTOM = 266;
const WIN_W = 430;
const WIN_H = 570;

type Look = { label: string; t: number; spherex: boolean; image?: HTMLImageElement };

function PathArt({ place, look, onCaption }: { place: ReadingPlace; look: PaletteId; onCaption: (s: string | undefined) => void }) {
  const input = place.input;
  const m = place.manifest;
  const images = useImageStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  const [pick, setPick] = useState(0);
  const [shown, setShown] = useState(false);

  const wise = m?.wise?.frames.length && input?.wiseImages.length ? m.wise : undefined;
  const bandId = input?.frame?.bandId ?? (m && m.frames.length ? defaultBand(m) : undefined);
  const visitUrls = useMemo(
    () => (m && bandId ? m.windows.map((w) => findFrame(m, w.id, bandId)?.image).map((p) => (p ? place.asset(p) : undefined)) : []),
    [m, bandId, place],
  );
  useEffect(() => preload(visitUrls.flatMap((u) => u ?? [])), [visitUrls]);

  const looks: Look[] = useMemo(() => {
    if (!m) return [];
    return [
      ...(wise ? wise.frames.map((f, i) => ({ label: `${monthYear(f.mjd_mid)} · WISE`, t: year(f.mjd_mid), spherex: false, image: input?.wiseImages[i] })) : []),
      ...m.windows.map((w, i) => ({ label: `${monthYear(w.mjd_mid)} · SPHEREx`, t: year(w.mjd_mid), spherex: true, image: images.get(visitUrls[i]) })),
    ];
    // Gambar kunjungan datang bertahap; `images` berganti tiap ada yang selesai dimuat.
  }, [m, wise, input, images, visitUrls]);

  // Setengah tinggi jendela dalam detik busur: sama untuk WISE dan SPHEREx, supaya skalanya tidak meloncat.
  const half = useMemo(() => {
    if (!m) return 140;
    const stackField = wise && input?.wiseImages[0] ? Math.min(input.wiseImages[0].naturalWidth, input.wiseImages[0].naturalHeight) * wise.pixel_arcsec : Infinity;
    return Math.min(140, stackField / 2, m.fov_arcsec / 2);
  }, [m, wise, input]);

  useEffect(() => {
    cache.current.clear();
  }, [input, look, half]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !m || !input) return;
    const chosen = pick > 0 ? looks[pick - 1] : undefined;
    const key = String(pick);
    let picture = cache.current.get(key);
    if (!picture) {
      const lut = LUTS[look];
      const wiseView = () => {
        const hh = half / wise!.pixel_arcsec;
        const hw = (hh * WIN_W) / WIN_H;
        return { x: wise!.target_px[0] + 0.5 - hw, y: wise!.target_px[1] + 0.5 - hh, w: hw * 2, h: hh * 2 };
      };
      const frameView = (img: HTMLImageElement) => {
        const hh = (half / m.fov_arcsec) * img.naturalHeight;
        const hw = (hh * WIN_W) / WIN_H;
        return { x: img.naturalWidth / 2 - hw, y: img.naturalHeight / 2 - hh, w: hw * 2, h: hh * 2 };
      };
      if (chosen) {
        const img = chosen.image;
        if (!img) return;
        picture = chosen.spherex
          ? colorize(img, img.naturalWidth, img.naturalHeight, frameView(img), WIN_W, WIN_H, lut)
          : colorize(img, img.naturalWidth, img.naturalHeight, wiseView(), WIN_W, WIN_H, lut, input.wiseTone);
      } else if (wise) {
        const stack = stackBrightest(input.wiseImages);
        picture = colorize(stack, stack.width, stack.height, wiseView(), WIN_W, WIN_H, lut, input.wiseTone);
      } else if (input.frame) {
        const img = input.frame.image;
        picture = colorize(img, img.naturalWidth, img.naturalHeight, frameView(img), WIN_W, WIN_H, lut);
      }
      if (!picture) return;
      cache.current.set(key, picture);
    }
    el.width = WIN_W;
    el.height = WIN_H;
    el.getContext("2d")!.drawImage(picture, 0, 0);
    setShown(true);
  }, [pick, looks, m, input, wise, look, half]);

  useEffect(() => {
    onCaption(pick > 0 ? looks[pick - 1]?.label : undefined);
  }, [pick, looks, onCaption]);

  const t0 = looks.length ? Math.floor(Math.min(...looks.map((l) => l.t))) : 2010;
  const t1 = looks.length ? Math.floor(Math.max(...looks.map((l) => l.t))) + 1 : 2026;
  const angle = (t: number) => 180 + ((t - t0) / (t1 - t0)) * 180;
  const angles = looks.map((l) => angle(l.t));
  const arch = (grow: number) =>
    `M${A_CX - A_R - grow} ${A_BOTTOM}V${A_CY}A${A_R + grow} ${A_R + grow} 0 0 1 ${A_CX + A_R + grow} ${A_CY}V${A_BOTTOM}`;
  const arc = (r: number) => `M${A_CX - r} ${A_CY}A${r} ${r} 0 0 1 ${A_CX + r} ${A_CY}`;

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (e.key === "Home") setPick(0);
    else if (step) setPick((p) => Math.max(0, Math.min(looks.length, p + step)));
    else return;
    e.preventDefault();
  };

  return (
    <div className="tcard-art" onPointerLeave={(e) => e.pointerType === "mouse" && setPick(0)}>
      <canvas
        ref={canvas}
        className="art-window"
        data-shown={shown}
        style={{
          left: `${((A_CX - A_R) / ART_W) * 100}%`,
          top: `${((A_CY - A_R) / ART_H) * 100}%`,
          width: `${((A_R * 2) / ART_W) * 100}%`,
          height: `${((A_BOTTOM - A_CY + A_R) / ART_H) * 100}%`,
          borderRadius: `50% 50% 0 0 / ${((A_R / (A_BOTTOM - A_CY + A_R)) * 100).toFixed(2)}% ${((A_R / (A_BOTTOM - A_CY + A_R)) * 100).toFixed(2)}% 0 0`,
        }}
        role="img"
        aria-label={
          wise
            ? `${wise.frames.length} WISE pictures of this place stacked into one, so anything that moved left a streak.`
            : "SPHEREx picture of this place."
        }
        onClick={() => setPick(0)}
      />
      <svg viewBox={`0 0 ${ART_W} ${ART_H}`}>
        <path className="a-hi" d={arch(0)} />
        <path className="a-lo" d={arch(4)} />
        {/* Tanda bidik: di sinilah benda itu, supaya yang diam pun ketemu. */}
        <path className="a-mark" d={`M${A_CX - 15} ${A_CY + 28}h8M${A_CX + 7} ${A_CY + 28}h8M${A_CX} ${A_CY + 13}v8M${A_CX} ${A_CY + 35}v8`} />
        <path className="a-lo" d={arc(A_R + 8) + arc(A_R + 38) + `M${A_CX - A_R - 8} ${A_CY}h-30M${A_CX + A_R + 8} ${A_CY}h30`} />
        {looks.length > 0 &&
          Array.from({ length: t1 - t0 + 1 }, (_, i) => (
            <path key={i} className="a-lo" d={`M${pt(polar(A_CX, A_CY, angle(t0 + i), A_R + 8))}L${pt(polar(A_CX, A_CY, angle(t0 + i), A_R + 12))}`} />
          ))}
        <g
          className="a-rays"
          tabIndex={looks.length ? 0 : -1}
          role="slider"
          aria-label="Step through the looks, one ray at a time"
          aria-valuemin={0}
          aria-valuemax={looks.length}
          aria-valuenow={pick}
          aria-valuetext={pick ? looks[pick - 1]?.label : "All looks stacked"}
          onKeyDown={onKey}
        >
          {looks.map((l, i) => {
            const a = angles[i];
            const tip = polar(A_CX, A_CY, a, A_R + (l.spherex ? 33 : 28));
            return (
              <g key={i} data-on={pick === i + 1} data-spherex={l.spherex}>
                <path className="a-ray" d={`M${pt(polar(A_CX, A_CY, a, A_R + 15))}L${pt(tip)}`} />
                <circle className="a-tip" cx={tip[0]} cy={tip[1]} r={l.spherex ? 2.2 : 1.7} />
              </g>
            );
          })}
          {looks.map((_, i) => {
            const a = angles[i];
            const before = i ? (angles[i - 1] + a) / 2 : a - 6;
            const after = i < looks.length - 1 ? (a + angles[i + 1]) / 2 : a + 6;
            return (
              <path
                key={i}
                className="a-hit"
                d={wedge(A_CX, A_CY, A_R + 4, A_R + 44, Math.max(180, before), Math.min(360, after))}
                onPointerEnter={() => setPick(i + 1)}
                onClick={() => setPick(i + 1)}
              />
            );
          })}
        </g>
        {looks.length > 0 && (
          <>
            <text className="a-label" x={A_CX - A_R - 23} y={A_CY + 14} textAnchor="middle" aria-hidden="true">
              {t0}
            </text>
            <text className="a-label" x={A_CX + A_R + 23} y={A_CY + 14} textAnchor="middle" aria-hidden="true">
              {t1}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/** Diagram kecil: tanda di kunjungan pertama, satu titik per kunjungan berikutnya. */
function DotsGlyph({ dots }: { dots: { east: number; north: number }[] }) {
  const reach = Math.max(SPHEREX_PIXEL_ARCSEC, ...dots.map((d) => Math.hypot(d.east, d.north)));
  const k = 13 / reach;
  const pixel = (SPHEREX_PIXEL_ARCSEC * k) / 2;
  const at = dots.map((d) => [-d.east * k, -d.north * k]);
  return (
    <svg viewBox="-20 -20 40 40">
      <rect className="g-lo" x={-pixel} y={-pixel} width={pixel * 2} height={pixel * 2} />
      <path className="g-gold" d="M-6 0H-2M2 0H6M0 -6V-2M0 2V6" />
      <path className="g-trail" d={at.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("")} />
      {at.slice(1).map((p, i) => (
        <circle key={i} className={i === at.length - 2 ? "g-dot g-dot-now" : "g-dot"} cx={p[0]} cy={p[1]} r="2.1" />
      ))}
    </svg>
  );
}

function pathBack(place: ReadingPlace) {
  const m = place.manifest;
  const wise = m?.wise?.frames.length ? m.wise : undefined;
  return (
    <>
      <dl className="facts">
        {wise && (
          <>
            <dt>WISE</dt>
            <dd>
              {wise.frames.length} unWISE coadds, {dayMonthYear(wise.frames[0].date_start)} to {dayMonthYear(wise.frames[wise.frames.length - 1].date_end)}, W2
              (4.6 µm), 2.75″ pixels
            </dd>
            <dt>Use</dt>
            <dd>For viewing. Positions and brightness are measured on SPHEREx only.</dd>
            <dt>Display</dt>
            <dd>Stretched by the same rule as the SPHEREx images and softened to their sharpness</dd>
          </>
        )}
        {m?.windows.map((w, i) => (
          <div key={w.id} className="facts-row">
            <dt>{i === 0 ? "SPHEREx" : ""}</dt>
            <dd>
              {dayMonthYear(w.date_start)} to {dayMonthYear(w.date_end)}, {w.n_exposures} exposures
            </dd>
          </div>
        ))}
        {m && !m.preview && (
          <>
            <dt>Pixels</dt>
            <dd>One SPHEREx pixel is {SPHEREX_PIXEL_ARCSEC}″: the faint square in the small diagram</dd>
          </>
        )}
      </dl>
      <p>
        On the lens, the amber mark is where the object was on the first SPHEREx visit and each dot is its measured position on a later
        one. The ring has north at the top and east on the left.
      </p>
    </>
  );
}

// ---------- III. Cahayanya ----------

const L_CX = 150;
const L_CY = 135;
const L_R = 50;
const L_R0 = 60;
const L_REACH = 44;
const lightAngle = (lambda: number) => -78 + ((lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)) * 336;

function LightArt({
  place,
  look,
  light,
  onCaption,
}: {
  place: ReadingPlace;
  look: PaletteId;
  light: Extract<ReturnType<typeof lightFacts>, { readable: true }>;
  onCaption: (s: string | undefined) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pick, setPick] = useState(-1);
  const [shown, setShown] = useState(false);
  const frame = place.input?.frame;
  const m = place.manifest;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !frame || !m) return;
    const img = frame.image;
    const w = (Math.min(150, m.fov_arcsec) / m.fov_arcsec) * img.naturalWidth;
    const lens = colorize(img, img.naturalWidth, img.naturalHeight, { x: (img.naturalWidth - w) / 2, y: (img.naturalHeight - w) / 2, w, h: w }, 300, 300, LUTS[look]);
    el.width = el.height = 300;
    el.getContext("2d")!.drawImage(lens, 0, 0);
    setShown(true);
  }, [frame, m, look]);

  const all = light.slices;
  useEffect(() => {
    const s = all[pick];
    onCaption(s ? `${s.lambda.toFixed(2)} µm · ${s.flux === null ? "no clean measurement" : fluxLabel(s.flux)}` : undefined);
  }, [pick, all, onCaption]);

  const step = 336 / all.length;
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    setPick((p) => Math.max(0, Math.min(all.length - 1, p + d)));
    e.preventDefault();
  };

  return (
    <div className="tcard-art" onPointerLeave={(e) => e.pointerType === "mouse" && setPick(-1)}>
      <canvas
        ref={canvas}
        className="art-window art-round"
        data-shown={shown}
        style={{
          left: `${((L_CX - L_R) / ART_W) * 100}%`,
          top: `${((L_CY - L_R) / ART_H) * 100}%`,
          width: `${((L_R * 2) / ART_W) * 100}%`,
          height: `${((L_R * 2) / ART_H) * 100}%`,
        }}
        role="img"
        aria-label="SPHEREx picture of this place, with its spectrum drawn as rays around it: longer rays are brighter."
      />
      <svg viewBox={`0 0 ${ART_W} ${ART_H}`}>
        <circle className="a-hi" cx={L_CX} cy={L_CY} r={L_R} />
        <circle className="a-lo" cx={L_CX} cy={L_CY} r={L_R + 4} />
        <circle className="a-dots" cx={L_CX} cy={L_CY} r={L_R0 + L_REACH + 6} />
        <g
          className="a-rays"
          tabIndex={0}
          role="slider"
          aria-label="Step through the spectrum, one wavelength at a time"
          aria-valuemin={LAMBDA_MIN}
          aria-valuemax={LAMBDA_MAX}
          aria-valuenow={all[Math.max(0, pick)].lambda}
          aria-valuetext={
            pick < 0
              ? "No wavelength chosen"
              : `${all[pick].lambda.toFixed(2)} microns, ${all[pick].flux === null ? "no clean measurement" : fluxLabel(all[pick].flux as number)}`
          }
          onKeyDown={onKey}
        >
          {all.map((s, i) => {
            const a = lightAngle(s.lambda);
            if (s.flux === null) {
              const p = polar(L_CX, L_CY, a, L_R0 + 2);
              return <circle key={i} className="a-gap" data-on={pick === i} cx={p[0]} cy={p[1]} r="1" />;
            }
            const length = 3 + Math.min(1, Math.max(0, s.flux / light.top)) * (L_REACH - 3);
            const tip = polar(L_CX, L_CY, a, L_R0 + length);
            return (
              <g key={i} data-on={pick === i}>
                <path className="a-beam" d={`M${pt(polar(L_CX, L_CY, a, L_R0))}L${pt(tip)}`} />
                <circle className="a-tip" cx={tip[0]} cy={tip[1]} r="1.1" />
              </g>
            );
          })}
          {all.map((s, i) => {
            const a = lightAngle(s.lambda);
            return (
              <path
                key={i}
                className="a-hit"
                d={wedge(L_CX, L_CY, L_R0 - 6, L_R0 + L_REACH + 12, a - step / 2, a + step / 2)}
                onPointerEnter={() => setPick(i)}
                onClick={() => setPick(i)}
              />
            );
          })}
        </g>
        {(
          [
            [0.75, "0.75"],
            [1, "1"],
            [2, "2"],
            [3, "3"],
            [4, "4"],
            [5, "5 µm"],
          ] as const
        ).map(([lambda, label]) => {
          const a = lightAngle(lambda);
          const at = polar(L_CX, L_CY, a, L_R0 + L_REACH + 20);
          return (
            <g key={label} aria-hidden="true">
              <path className="a-gold" d={`M${pt(polar(L_CX, L_CY, a, L_R0 + L_REACH + 8))}L${pt(polar(L_CX, L_CY, a, L_R0 + L_REACH + 12))}`} />
              <text className="a-label" x={at[0]} y={at[1] + 3.6} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function lightBack(place: ReadingPlace) {
  const points = place.input?.points ?? [];
  const count = (flag: string) => points.filter((p) => p.flag === flag).length;
  const m = place.manifest;
  const band = m?.bands.find((b) => b.id === place.input?.frame?.bandId);
  return (
    <>
      <dl className="facts">
        {band && (
          <>
            <dt>Picture</dt>
            <dd>SPHEREx, {microns(band.lambda_min, band.lambda_max)}, median of one visit's exposures</dd>
          </>
        )}
        {m && !m.preview && (
          <>
            <dt>Data</dt>
            <dd>{m.source.n_exposures_used} SPHEREx exposures in all, each one a different wavelength</dd>
          </>
        )}
        {points.length > 0 && (
          <>
            <dt>Clean</dt>
            <dd>{count("ok")} measurements: only these are drawn as rays</dd>
            <dt>
              <i className="sw sw-sat" />
              Saturated
            </dt>
            <dd>
              {count("saturated")} flagged, {count("saturated_core")} with no usable core: the source is too bright
            </dd>
            <dt>
              <i className="sw sw-bad" />
              Bad pixel
            </dt>
            <dd>{count("bad_pixel")} on a bad or missing detector pixel</dd>
          </>
        )}
      </dl>
      <p>
        Each ray is the median of the clean measurements in one of 72 equal steps from 0.75 to 5 µm, over all visits. A small open dot
        is a step with no clean measurement.
      </p>
      <p>
        Listen plays one visit from short to long wavelength: higher pitch is brighter, a rougher tone is a value flagged as saturated,
        and a soft tick is a gap.
      </p>
    </>
  );
}

// ---------- 0. Seluruh langit ----------

function SkyArt({ atlas, band, look, places }: { atlas: Atlas; band: string; look: PaletteId; places: { name: string; ra: number; dec: number }[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = atlas.frames.find((f) => f.band === band) ?? atlas.frames[0];
  useEffect(() => {
    let alive = true;
    loadGray(atlasUrl(frame.small))
      .then((gray) => alive && canvas.current && paintSky(canvas.current, gray, LUTS[look]))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [frame, look]);
  const { width, height } = atlas.projection;
  const figures = useMemo(
    () =>
      Object.values(atlas.constellations.lines)
        .flat()
        .map((line) => {
          let d = "";
          let last: { x: number; y: number } | undefined;
          for (const [r, de] of line) {
            const p = toMap(atlas, r, de);
            // Garis yang melompat dari satu tepi peta ke tepi lain diputus.
            const jump = last && Math.abs(p.x - last.x) > width / 3;
            d += `${last && !jump ? "L" : "M"}${p.x.toFixed(0)} ${p.y.toFixed(0)}`;
            last = p;
          }
          return d;
        })
        .join(""),
    [atlas, width],
  );
  return (
    <div className="tcard-art tcard-art-sky">
      <canvas ref={canvas} className="art-sky" role="img" aria-label="The whole sky as SPHEREx mapped it, with our galaxy across the middle." />
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path className="s-figure" d={figures} />
        <ellipse className="s-rim" cx={width / 2} cy={height / 2} rx={width / 2 - 2} ry={height / 2 - 2} />
        {places.map((p) => {
          const at = toMap(atlas, p.ra, p.dec);
          return <circle key={p.name} className="s-ring" cx={at.x} cy={at.y} r="26" />;
        })}
      </svg>
    </div>
  );
}

const SKY_KEYS: [string, string][] = [
  ["+ −", "zoom the map"],
  ["← → ↑ ↓", "move the map"],
  ["0", "back to the whole sky"],
  ["1 to 6", "wavelength"],
  ["Enter", "look at the aimed spot"],
  ["Esc", "clear the aim"],
  ["C", "next look"],
  ["R", "reveal faint things"],
  ["/", "go to a place"],
  ["G", "these cards"],
];

const PLACE_KEYS: [string, string][] = [
  ["Space", "blink"],
  ["← →", "step through visits"],
  ["1 to 6", "image band"],
  ["+ −", "zoom the lens, out to the wide view and the whole sky"],
  ["C", "next look"],
  ["R", "reveal faint things"],
  ["D", "difference from the first look"],
  ["A", "stars of the Gaia catalogue"],
  ["L", "listen to the spectrum"],
  ["M", "motion sound"],
  ["/", "go to a place"],
  ["G", "these cards"],
  ["F", "focus on the object"],
];

/** Bacaan: pengganti Guide. Tiap kartu satu gambar dari data di layar dan satu kalimat;
 *  sisi belakangnya menyimpan rincian data. */
export function Reading({ open, onClose, look, atlas, sky, place, canShare, onShare, onWholeSky }: Props) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const [pathCaption, setPathCaption] = useState<string>();
  const [lightCaption, setLightCaption] = useState<string>();

  useEffect(() => {
    if (open) {
      setFlipped({});
      setMore(false);
    }
  }, [open]);

  const m = place?.manifest;
  const facts = useMemo(() => (atlas && place ? placeFacts(atlas, place.ra, place.dec) : undefined), [atlas, place?.ra, place?.dec]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = useMemo(() => (m ? pathFacts(m, place?.blended, place?.cataloguePm) : undefined), [m, place?.blended, place?.cataloguePm]);
  const light = useMemo(
    () => (place ? lightFacts(place.input?.points, place.spectrumPending, place.blended, m?.preview) : undefined),
    [place?.input?.points, place?.spectrumPending, place?.blended, m?.preview], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const verdict = useMemo(
    () => (m && !m.preview ? measured({ manifest: m, blended: place?.blended, cataloguePm: place?.cataloguePm }).title : "THE PATH"),
    [m, place?.blended, place?.cataloguePm],
  );

  if (!open) return null;

  const skin = SKINS[look];
  const vars = Object.fromEntries(
    (["top", "bottom", "gold", "hi", "lo", "text", "muted", "faint", "banner", "dot"] as const).map((k) => [`--c-${k}`, skin[k].join(" ")]),
  ) as CSSProperties;
  const flip = (id: string) => () => setFlipped((f) => ({ ...f, [id]: !f[id] }));
  const lookName = LOOKS.find((l) => l.id === look)?.name;
  const wiseFrames = m?.wise?.frames ?? [];
  const wiseCount = wiseFrames.length;
  const wiseYears = wiseCount ? Math.round(year(wiseFrames[wiseCount - 1].mjd_mid) - year(wiseFrames[0].mjd_mid)) : 0;
  const lead = place?.note.split(/(?<=\.)\s/)[0];
  const skyFrame = atlas && sky ? (atlas.frames.find((f) => f.band === sky.band) ?? atlas.frames[0]) : undefined;

  return (
    <div
      className="scrim scrim-reading"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="reading" role="dialog" aria-modal="true" aria-label={place ? `${place.name} in three cards` : "The whole sky in one card"} style={vars}>
        <header className="reading-head">
          <div>
            <p className="reading-kind">
              <StarFour weight="fill" aria-hidden="true" />
              {place ? `${place.kind} · in three cards` : "The widest view · in one card"}
            </p>
            <h2>{place ? place.name : "The whole sky"}</h2>
            {lead && <p className="reading-lead">{lead}</p>}
          </div>
          <button type="button" className="round" aria-label="Close" data-autofocus onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="reading-cards" data-count={place ? 3 : 1}>
          {place && (
            <>
              <Card
                index={0}
                numeral="I"
                hook="Where it is"
                title="The place"
                flipped={!!flipped.place}
                onFlip={flip("place")}
                back={placeBack(atlas, facts, place.ra, place.dec)}
                action={
                  <button type="button" className="pill pill-quiet" onClick={onWholeSky}>
                    Whole sky
                  </button>
                }
                front={
                  atlas && facts ? (
                    <>
                      <PlaceArt atlas={atlas} facts={facts} ra={place.ra} dec={place.dec} look={look} />
                      <p className="tcard-caption">{PATCH_DEG}° of sky · north up, east left</p>
                      <Ribbon text={facts.constellation.toUpperCase()} />
                      <p className="tcard-say">
                        It lies in the constellation {facts.constellation}. The figure is drawn over SPHEREx's own map of that sky.
                      </p>
                      <ul className="tcard-facts">
                        <Fact glyph={<Locator atlas={atlas} ra={place.ra} dec={place.dec} look={look} />}>{facts.plane}</Fact>
                        <Fact
                          glyph={
                            <svg viewBox="-20 -20 40 40">
                              <circle className="g-lo" r="12" />
                              <path className="g-lo g-dash" d="M-12 0H12" />
                              <path
                                className="g-gold"
                                d={(() => {
                                  // Garis lintang batas: di luar itu benda ini tidak pernah terbit.
                                  const limit = ((90 - Math.abs(place.dec)) * Math.PI) / 180;
                                  const y = (place.dec > 0 ? 1 : -1) * 12 * Math.sin(limit);
                                  const x = 12 * Math.cos(limit);
                                  return Math.abs(place.dec) < 20 ? "M-12 0H12" : `M${-x.toFixed(1)} ${y.toFixed(1)}H${x.toFixed(1)}`;
                                })()}
                              />
                            </svg>
                          }
                        >
                          {facts.visible}
                        </Fact>
                      </ul>
                    </>
                  ) : (
                    <>
                      <div className="tcard-art" />
                      <p className="tcard-caption">Reading the map…</p>
                    </>
                  )
                }
              />

              <Card
                index={1}
                numeral="II"
                hook="How it moves"
                title="The path"
                flipped={!!flipped.path}
                onFlip={flip("path")}
                back={pathBack(place)}
                front={
                  <>
                    <PathArt place={place} look={look} onCaption={setPathCaption} />
                    <p className="tcard-caption" data-live={!!pathCaption}>
                      {pathCaption ?? (place.input ? "Each ray is one look · point at one" : "Reading the pictures…")}
                    </p>
                    <Ribbon text={verdict} />
                    <p className="tcard-say">
                      {wiseYears
                        ? `${wiseYears} years of WISE pictures, stacked into one. Anything that moved left a streak.`
                        : "SPHEREx's picture of this place. Each ray is one visit."}
                    </p>
                    {path && (
                      <ul className="tcard-facts">
                        <Fact
                          glyph={
                            path.dots.length > 1 ? (
                              <DotsGlyph dots={path.dots} />
                            ) : (
                              <svg viewBox="-20 -20 40 40">
                                <circle className="g-lo" r="11" />
                                <path className="g-gold" d="M-6 0H-2M2 0H6M0 -6V-2M0 2V6" />
                              </svg>
                            )
                          }
                        >
                          {path.measured}
                        </Fact>
                        {path.moon ? (
                          <Fact
                            glyph={
                              <svg viewBox="-20 -20 40 40">
                                <circle className="g-lo" r="12" />
                                <path className="g-trail" d="M-12 0H12" />
                                <circle className="g-dot g-dot-now" cx="-12" cy="0" r="2.1" />
                              </svg>
                            }
                          >
                            {path.moon}
                          </Fact>
                        ) : (
                          wiseCount > 0 &&
                          m && (
                            <Fact
                              glyph={
                                <svg viewBox="-20 -20 40 40">
                                  <path className="g-gold" d="M-12 8L-7 -3M-5 8L-3 -7M2 8L3 -7M9 8L8 -3" />
                                  <path className="g-lo" d="M-14 11H14" />
                                </svg>
                              }
                            >
                              {wiseCount} looks by WISE, then {m.windows.length} by SPHEREx.
                            </Fact>
                          )
                        )}
                      </ul>
                    )}
                  </>
                }
              />

              <Card
                index={2}
                numeral="III"
                hook="What its light is"
                title="The light"
                flipped={!!flipped.light}
                onFlip={flip("light")}
                down={!light?.readable}
                back={lightBack(place)}
                front={
                  light?.readable ? (
                    <>
                      <LightArt place={place} look={look} light={light} onCaption={setLightCaption} />
                      <p className="tcard-caption" data-live={!!lightCaption}>
                        {lightCaption ?? "Each ray is one colour · point at one"}
                      </p>
                      <Ribbon text="THE VOICE" />
                      <p className="tcard-say">Its light, split into 72 steps of infrared. Longer rays are brighter.</p>
                      <ul className="tcard-facts">
                        <Fact
                          glyph={
                            <svg viewBox="-20 -20 40 40">
                              <path className="g-gold" d="M-12 10V2M-7 10V-4M-2 10V-9M3 10V-2M8 10V4M13 10V7" />
                              <path className="g-lo" d="M-15 12H16" />
                            </svg>
                          }
                        >
                          {light.clean} clean measurements by SPHEREx. Brightest near {light.peakUm.toFixed(1)} µm.
                        </Fact>
                        <Fact
                          glyph={
                            <svg viewBox="-20 -20 40 40">
                              {/* Skala 0 sampai 5 mikron: mata melihat 0,4 sampai 0,7; SPHEREx 0,75 sampai 5. */}
                              <path className="g-lo" d="M-15 0H15" />
                              <path className="g-eye" d="M-12.6 -4V4M-10.8 -4V4" />
                              <path className="g-bar" d="M-10.5 0H15" />
                            </svg>
                          }
                        >
                          All of it is infrared. Your eyes stop at 0.7 µm; this runs to 5.
                        </Fact>
                      </ul>
                    </>
                  ) : (
                    <FaceDown why={light?.why ?? ""} counts={light && !light.readable ? light.counts : undefined} />
                  )
                }
              />
            </>
          )}

          {!place && sky && atlas && skyFrame && (
            <Card
              index={0}
              numeral="0"
              hook="Where everything is"
              title="The whole sky"
              flipped={!!flipped.sky}
              onFlip={flip("sky")}
              back={
                <>
                  <dl className="facts">
                    <dt>Map</dt>
                    <dd>SPHEREx DR1 all-sky data cube from IRSA, {monthYear(atlas.source.mjd_start)} to {monthYear(atlas.source.mjd_end)}</dd>
                    <dt>Light</dt>
                    <dd>{skyFrame.lambda_um.toFixed(2)} µm, one of SPHEREx's 102 wavelengths; the six buttons pick one in each detector band</dd>
                    <dt>Detail</dt>
                    <dd>
                      About {Math.round(atlas.source.pixel_arcmin)}′ per pixel for the whole sky. Zooming in loads sharper pieces from IRSA, down to
                      about 13″ per pixel
                    </dd>
                    <dt>Shape</dt>
                    <dd>The sky is a sphere, so a flat map stretches it. East is to the left, as when you look up</dd>
                    <dt>Gaps</dt>
                    <dd>A few black patches near very bright regions are gaps in the map</dd>
                  </dl>
                  <p>Nothing is measured from this map. Motion and spectra come from the individual SPHEREx images of each place.</p>
                </>
              }
              front={
                <>
                  <SkyArt atlas={atlas} band={sky.band} look={look} places={sky.places} />
                  <p className="tcard-caption">
                    Seen at {skyFrame.lambda_um.toFixed(2)} <span className="unit">µm</span>
                  </p>
                  <Ribbon text="THE WHOLE SKY" />
                  <p className="tcard-say">SPHEREx's own map of the entire sky, from its first year of scans. Our galaxy runs across the middle.</p>
                  <ul className="tcard-facts">
                    <Fact
                      glyph={
                        <svg viewBox="-20 -20 40 40">
                          <circle className="g-gold" r="8" />
                          <circle className="g-dot g-dot-now" r="2.4" />
                        </svg>
                      }
                    >
                      Amber rings are places to open. Choose one and the map dives in.
                    </Fact>
                    <Fact
                      glyph={
                        <svg viewBox="-20 -20 40 40">
                          <path className="g-gold" d="M-13 7L-4 -3L5 1L13 -9" />
                        </svg>
                      }
                    >
                      The figures are constellations, drawn between the real stars.
                    </Fact>
                    <Fact
                      glyph={
                        <svg viewBox="-20 -20 40 40">
                          <path className="g-lo" d="M-14 5C-5 -4 5 -4 14 5M-14 -3C-5 -11 5 -11 14 -3" />
                        </svg>
                      }
                    >
                      The faint grid is the sky's longitude and latitude.
                    </Fact>
                  </ul>
                </>
              }
            />
          )}
        </div>

        <footer className="reading-foot">
          <p className="reading-ramp">
            <span>Faint</span>
            <i style={{ background: lookGradient(look) }} aria-hidden="true" />
            <span>Bright</span>
            <span className="reading-look">{lookName}</span>
          </p>
          <div className="reading-actions">
            <button type="button" className="pill pill-quiet" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <Keyboard aria-hidden="true" />
              Keys and sources
            </button>
            {place && canShare && (
              <button type="button" className="pill pill-share" onClick={onShare}>
                <ShareNetwork aria-hidden="true" />
                Draw a card to share
              </button>
            )}
          </div>
        </footer>

        {more && (
          <section className="reading-more">
            <dl className="facts keys">
              {(place ? PLACE_KEYS : SKY_KEYS).map(([key, what]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <div>
              {place ? (
                <>
                  <p>
                    SPHEREx all-sky infrared survey, level 2 images from the NASA/IPAC Infrared Science Archive. Names and catalogue motions come
                    from SIMBAD.
                  </p>
                  <p>
                    Images from 2010 to 2024 are from NASA's WISE and NEOWISE missions: unWISE time-resolved coadds, served by WiseView from the
                    Backyard Worlds: Planet 9 project.
                  </p>
                </>
              ) : (
                <p>
                  SPHEREx DR1 all-sky map: NASA/JPL-Caltech/IPAC, served by the NASA/IPAC Infrared Science Archive. Constellation figures from
                  d3-celestial by Olaf Frohn; constellation boundaries are the official IAU ones.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
