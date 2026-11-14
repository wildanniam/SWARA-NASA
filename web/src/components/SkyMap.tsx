import { ArrowRight, X } from "@phosphor-icons/react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  atlasUrl,
  constellationAt,
  decDms,
  fromMap,
  insideMap,
  meridian,
  parallel,
  raHms,
  skyPath,
  toMap,
  type Atlas,
} from "../lib/allsky";
import { monthYear } from "../lib/format";
import { prefersReducedMotion } from "../lib/hooks";
import { lookGradient, LOOKS, LUTS, REVEAL_LUT, type PaletteId } from "../lib/palette";
import { loadGray, paintSky } from "../lib/skyimage";

/** Tempat yang ditandai di peta: contoh, atau tempat yang dibuka pengguna di sesi ini. */
export type SkyMarker = {
  id: string;
  name: string;
  detail: string;
  ra: number;
  dec: number;
  yours: boolean;
  current: boolean;
};

/** Titik di peta dalam persen lebar dan tinggi peta. */
export type MapSpot = { x: number; y: number };

type Props = {
  atlas?: Atlas;
  failed: boolean;
  band: string;
  onBand: (band: string) => void;
  look: PaletteId;
  onPalette: (look: PaletteId) => void;
  reveal: boolean;
  lines: boolean;
  onLines: (on: boolean) => void;
  markers: SkyMarker[];
  /** Penanda dipilih: buka tempat itu. */
  onPick: (id: string, at: MapSpot) => void;
  /** Titik bidikan dipastikan: buka koordinat itu. Mengembalikan pesan kalau gagal. */
  onGo: (ra: number, dec: number, at: MapSpot) => Promise<string | null>;
  onTour: () => void;
  /** Gerak masuk (dari tempat ke seluruh langit) atau keluar (menyelam ke satu titik). */
  fx?: { kind: "enter" | "leave"; at: MapSpot };
  /** Tempat ini sedang tertutup oleh peta: elemen di bawahnya tidak bisa difokus. */
  busy?: boolean;
};

type Pointer = { left: number; top: number; width: number; height: number; ra: number; dec: number; abbr: string };
type Aim = { ra: number; dec: number; abbr: string; at: MapSpot };

// Kisi koordinat: lingkaran Dec tiap 30 derajat dan garis RA tiap 3 jam.
const PARALLELS = [-60, -30, 30, 60];
const MERIDIANS = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => h * 15);
// Label benda: arah tulisan dari titiknya, supaya tidak menutupi benda itu sendiri.
const FEATURE_SIDE: Record<string, "above" | "below"> = {
  "Centre of the Milky Way": "above",
  "Andromeda Galaxy": "above",
};

const pct = (atlas: Atlas, ra: number, dec: number): MapSpot => {
  const p = toMap(atlas, ra, dec);
  return { x: (p.x / atlas.projection.width) * 100, y: (p.y / atlas.projection.height) * 100 };
};

/** Garis kisi, garis rasi, dan tepi langit. Hanya digambar ulang saat isinya berubah. */
const Overlay = memo(function Overlay({ atlas, lines, hot }: { atlas: Atlas; lines: boolean; hot?: string }) {
  const { width: W, height: H } = atlas.projection;
  const paths = useMemo(() => {
    const figures: Record<string, string> = {};
    for (const [abbr, parts] of Object.entries(atlas.constellations.lines)) {
      figures[abbr] = parts.map((seg) => skyPath(atlas, seg)).join("");
    }
    return {
      grid: [...PARALLELS.map((d) => parallel(atlas, d)), ...MERIDIANS.map((r) => meridian(atlas, r))].join(""),
      equator: parallel(atlas, 0),
      figures,
      all: Object.values(figures).join(""),
    };
  }, [atlas]);
  return (
    <svg className="atlas-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="sky-grid" d={paths.grid} />
      <path className="sky-equator" d={paths.equator} />
      {lines && <path className="sky-lines" d={paths.all} />}
      {hot && paths.figures[hot] && <path className="sky-lines-hot" d={paths.figures[hot]} />}
      <ellipse className="sky-edge" cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2} />
    </svg>
  );
});

/** Label tetap: jam RA di ekuator langit dan benda yang bisa dikenali. */
const Labels = memo(function Labels({ atlas, markers }: { atlas: Atlas; markers: SkyMarker[] }) {
  const spots = markers.map((m) => pct(atlas, m.ra, m.dec));
  // Label kisi disingkirkan kalau terlalu dekat dengan penanda.
  const clear = (p: MapSpot) => spots.every((s) => Math.abs(s.x - p.x) > 9 || Math.abs(s.y - p.y) > 7);
  const hours = [0, 6, 12, 18]
    .map((h) => ({ h, p: pct(atlas, h * 15, 0) }))
    .filter(({ p }) => p.x > 6 && p.x < 94 && clear(p));
  const equator = pct(atlas, 26, 0);
  return (
    <div className="atlas-labels" aria-hidden="true">
      {hours.map(({ h, p }) => (
        <span key={h} className="sky-hour" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {h}h
        </span>
      ))}
      {clear(equator) && (
        <span className="sky-equator-label" style={{ left: `${equator.x}%`, top: `${equator.y}%` }}>
          celestial equator
        </span>
      )}
      {atlas.features.map((f) => {
        const p = pct(atlas, f.ra, f.dec);
        return (
          <span
            key={f.name}
            className="sky-feature"
            data-side={FEATURE_SIDE[f.name] ?? "below"}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {f.name}
          </span>
        );
      })}
    </div>
  );
});

/** Seluruh langit menurut SPHEREx: tingkat terluar teleskop dan pintu masuk ke tempat mana pun. */
export function SkyMap(p: Props) {
  const { atlas, band, look, reveal } = p;
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLCanvasElement>(null);
  const painted = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [loadingBand, setLoadingBand] = useState<string>();
  const [pointer, setPointer] = useState<Pointer>();
  const [aim, setAim] = useState<Aim>();
  const [aimBusy, setAimBusy] = useState(false);
  const [aimError, setAimError] = useState<string>();
  const goRef = useRef<HTMLButtonElement>(null);
  // Layar kecil memuat versi separuh lebar; ditentukan sekali saat dibuka.
  const small = useMemo(() => window.innerWidth * (window.devicePixelRatio || 1) <= 1400, []);
  const touch = useMemo(() => window.matchMedia?.("(pointer: coarse)").matches ?? false, []);

  const frame = atlas?.frames.find((f) => f.band === band) ?? atlas?.frames.find((f) => f.band === atlas.default_band);

  // Label kisi dan benda tidak boleh menimpa penanda atau label lain: yang bertabrakan
  // dipindah ke sisi lain bendanya, atau disembunyikan. Diukur setelah tata letak dan
  // diulang saat ukuran peta berubah.
  const { markers } = p;
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map || !atlas) return;
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right + 8 && a.right + 8 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top;
    const fit = () => {
      const bounds = map.getBoundingClientRect();
      const cx = bounds.left + bounds.width / 2;
      const cy = bounds.top + bounds.height / 2;
      // Label harus di dalam elips langit, bukan hanya di dalam kotaknya.
      const inside = (r: DOMRect) =>
        [r.left, r.right].every((x) =>
          [r.top, r.bottom].every((y) => ((x - cx) / (bounds.width / 2)) ** 2 + ((y - cy) / (bounds.height / 2)) ** 2 <= 0.97),
        );
      const markers = [...map.querySelectorAll<HTMLElement>(".sky-marker")];
      const rings = markers.map((el) => el.querySelector(".sky-marker-ring")!.getBoundingClientRect());
      const placed: DOMRect[] = [...rings];
      // Nama penanda: di sisi bawaannya, atau di sisi lain, atau hanya cincinnya.
      // Cincinnya sendiri tidak dihitung: namanya memang menempel di sana.
      for (const [i, el] of markers.entries()) {
        const text = el.querySelector<HTMLElement>(".sky-marker-text")!;
        el.dataset.label = "shown";
        const free = () => {
          const r = text.getBoundingClientRect();
          const within = r.left >= bounds.left - 2 && r.right <= bounds.right + 2;
          return within && !placed.some((b) => b !== rings[i] && overlaps(r, b)) ? r : undefined;
        };
        let r = free();
        if (!r) {
          el.dataset.side = el.dataset.side === "left" ? "right" : "left";
          r = free();
        }
        if (r) placed.push(r);
        else el.dataset.label = "hidden";
      }
      for (const el of map.querySelectorAll<HTMLElement>(".sky-feature, .sky-hour, .sky-equator-label")) {
        el.dataset.hidden = "false";
        const free = () => {
          const r = el.getBoundingClientRect();
          return inside(r) && !placed.some((b) => overlaps(r, b)) ? r : undefined;
        };
        let r = free();
        if (!r && el.classList.contains("sky-feature")) {
          el.dataset.side = el.dataset.side === "above" ? "below" : "above";
          r = free();
        }
        if (r) placed.push(r);
        else el.dataset.hidden = "true";
      }
    };
    fit();
    // Ukuran teks baru pasti setelah huruf termuat.
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(map);
    return () => observer.disconnect();
  }, [atlas, markers]);

  // Lukis peta. Ganti panjang gelombang: peta lama larut ke yang baru (langit sama,
  // cahaya lain). Ganti look atau Reveal faint: dilukis ulang di tempat.
  useEffect(() => {
    if (!frame) return;
    let alive = true;
    setLoadingBand(frame.band);
    loadGray(atlasUrl(small ? frame.small : frame.image))
      .then((gray) => {
        const canvas = canvasRef.current;
        const fade = fadeRef.current;
        if (!alive || !canvas) return;
        const crossfade = !!painted.current && painted.current !== frame.band && !!fade && !prefersReducedMotion();
        if (crossfade && fade) {
          fade.width = canvas.width;
          fade.height = canvas.height;
          fade.getContext("2d")!.drawImage(canvas, 0, 0);
          fade.style.transition = "none";
          fade.style.opacity = "1";
        }
        paintSky(canvas, gray, LUTS[look], reveal ? REVEAL_LUT : undefined);
        if (crossfade && fade) {
          // Dua bingkai kemudian, supaya peralihan opasitasnya benar-benar berjalan.
          window.setTimeout(() => {
            fade.style.transition = "";
            fade.style.opacity = "0";
          }, 30);
        }
        painted.current = frame.band;
        setReady(true);
        setImageFailed(false);
        setLoadingBand(undefined);
      })
      .catch((err) => {
        console.error(err);
        if (alive) {
          setImageFailed(true);
          setLoadingBand(undefined);
        }
      });
    return () => {
      alive = false;
    };
  }, [frame, small, look, reveal]);

  // Bidikan: Enter membuka titik itu, Esc membatalkannya.
  useEffect(() => {
    if (!aim) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAim(undefined);
      else if (e.key === "Enter" && !(e.target as HTMLElement).closest?.("button, input, a")) goRef.current?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aim]);

  const locate = (clientX: number, clientY: number) => {
    const el = mapRef.current;
    if (!atlas || !el) return undefined;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * atlas.projection.width;
    const y = ((clientY - rect.top) / rect.height) * atlas.projection.height;
    if (!insideMap(atlas, x, y)) return undefined;
    const at = fromMap(atlas, x, y)!;
    return { rect, left: clientX - rect.left, top: clientY - rect.top, ...at, abbr: constellationAt(atlas, at.ra, at.dec) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const onMarker = (e.target as HTMLElement).closest(".sky-marker, .aim-card");
    const hit = onMarker ? undefined : locate(e.clientX, e.clientY);
    setPointer(
      hit
        ? { left: hit.left, top: hit.top, width: hit.rect.width, height: hit.rect.height, ra: hit.ra, dec: hit.dec, abbr: hit.abbr }
        : undefined,
    );
  };

  const onClick = (e: React.MouseEvent) => {
    if (!atlas || (e.target as HTMLElement).closest(".sky-marker, .aim-card")) return;
    const hit = locate(e.clientX, e.clientY);
    if (!hit) {
      setAim(undefined);
      return;
    }
    // Ketukan yang hampir mengenai penanda dianggap memilih penanda itu.
    const near = p.markers
      .map((m) => {
        const s = pct(atlas, m.ra, m.dec);
        return { m, s, d: Math.hypot(((s.x - (hit.left / hit.rect.width) * 100) * hit.rect.width) / 100, ((s.y - (hit.top / hit.rect.height) * 100) * hit.rect.height) / 100) };
      })
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < (touch ? 22 : 12)) {
      p.onPick(near.m.id, near.s);
      return;
    }
    setAimError(undefined);
    setAim({ ra: hit.ra, dec: hit.dec, abbr: hit.abbr, at: { x: (hit.left / hit.rect.width) * 100, y: (hit.top / hit.rect.height) * 100 } });
  };

  const go = async () => {
    if (!aim || aimBusy) return;
    setAimBusy(true);
    setAimError(undefined);
    const error = await p.onGo(aim.ra, aim.dec, aim.at);
    setAimBusy(false);
    if (error) setAimError(error);
  };

  const names = atlas?.constellations.names ?? {};
  const hot = aim?.abbr ?? pointer?.abbr;
  const hotLabel = atlas && hot ? atlas.constellations.labels[hot] : undefined;
  const hotSpot = atlas && hotLabel ? pct(atlas, hotLabel[0], hotLabel[1]) : undefined;
  const lambda = frame ? `${frame.lambda_um.toFixed(2)} µm` : "";

  const fxStyle = p.fx ? ({ "--fx": `${p.fx.at.x}%`, "--fy": `${p.fx.at.y}%` } as CSSProperties) : undefined;

  return (
    <div className="atlas" data-fx={p.fx?.kind} data-look={look} style={fxStyle} inert={p.busy}>
      <div className="atlas-head">
        <p className="atlas-kicker">
          {atlas
            ? `SPHEREx all-sky map · ${monthYear(atlas.source.mjd_start)} to ${monthYear(atlas.source.mjd_end)}`
            : "SPHEREx all-sky map"}
        </p>
      </div>

      <div className="atlas-stage">
        <div className="atlas-plot">
          <div
            ref={mapRef}
            className="atlas-map"
            data-ready={ready}
            onPointerMove={onMove}
            onPointerLeave={() => setPointer(undefined)}
            onClick={onClick}
          >
            <canvas
              ref={canvasRef}
              className="atlas-canvas"
              role="img"
              aria-label={`The whole sky as SPHEREx saw it at ${lambda}: our galaxy runs across the middle.`}
            />
            <canvas ref={fadeRef} className="atlas-fade" aria-hidden="true" />
            {atlas && <Overlay atlas={atlas} lines={p.lines} hot={hot} />}
            {atlas && <Labels atlas={atlas} markers={p.markers} />}
            {hotSpot && hot && (
              <span
                className="sky-constellation"
                data-anchor={hotSpot.x > 84 ? "end" : hotSpot.x < 16 ? "start" : "middle"}
                style={{ left: `${hotSpot.x}%`, top: `${hotSpot.y}%` }}
                aria-hidden="true"
              >
                {names[hot]}
              </span>
            )}
            {atlas &&
              p.markers.map((m) => {
                const s = pct(atlas, m.ra, m.dec);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="sky-marker"
                    data-yours={m.yours}
                    data-current={m.current}
                    data-side={s.x > 72 ? "left" : "right"}
                    style={{ left: `${s.x}%`, top: `${s.y}%` }}
                    aria-label={`${m.name}, ${m.detail}. Look closer.`}
                    onClick={() => p.onPick(m.id, s)}
                  >
                    <span className="sky-marker-ring" aria-hidden="true" />
                    <span className="sky-marker-text" aria-hidden="true">
                      <b>{m.name}</b>
                      <small>{m.current ? "you were here" : m.detail}</small>
                      <em>Look closer</em>
                    </span>
                  </button>
                );
              })}
            {aim && (
              <span className="sky-aim" style={{ left: `${aim.at.x}%`, top: `${aim.at.y}%` }} aria-hidden="true">
                <svg viewBox="-20 -20 40 40">
                  <circle r="9" />
                  <path d="M0 -9V-17M0 9V17M-9 0H-17M9 0H17" />
                </svg>
              </span>
            )}
            {pointer && !aim && (
              <div
                className="sky-readout"
                data-flip-x={pointer.left > pointer.width - 260}
                data-flip-y={pointer.top > pointer.height - 110}
                style={{ left: pointer.left, top: pointer.top }}
                aria-hidden="true"
              >
                <span className="sky-readout-coords">
                  RA {raHms(pointer.ra)}
                  <i />
                  Dec {decDms(pointer.dec)}
                </span>
                <span className="sky-readout-name">{names[pointer.abbr] ?? ""}</span>
                <span className="sky-readout-hint">Click to aim here</span>
              </div>
            )}
            {!atlas && !p.failed && <p className="atlas-wait">Finding the whole sky…</p>}
            {(p.failed || imageFailed) && (
              <p className="atlas-wait" role="alert">
                The sky map could not be loaded. You can still go to a place by name or coordinates.
              </p>
            )}
          </div>

          {aim && (
            <div
              className="aim-card"
              role="group"
              aria-label={`Aimed at ${names[aim.abbr] ?? "the sky"}`}
              data-flip-x={aim.at.x > 62}
              data-flip-y={aim.at.y > 58}
              style={{ "--ax": `${aim.at.x}%`, "--ay": `${aim.at.y}%` } as CSSProperties}
            >
              <div className="aim-card-head">
                <b>{names[aim.abbr] ?? "Open sky"}</b>
                <button type="button" className="round" aria-label="Clear the aim" onClick={() => setAim(undefined)}>
                  <X aria-hidden="true" />
                </button>
              </div>
              <p className="aim-coords">
                RA {raHms(aim.ra)}
                <br />
                Dec {decDms(aim.dec)}
              </p>
              <p className="aim-note" role={aimError ? "alert" : undefined}>
                {aimError ?? "SPHEREx has looked here too. A new place takes about a minute to gather the first time."}
              </p>
              <button ref={goRef} type="button" className="pill pill-accent" disabled={aimBusy} onClick={() => void go()}>
                {aimBusy ? "Pointing the telescope…" : "Look here"}
                {!aimBusy && <ArrowRight aria-hidden="true" />}
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="atlas-foot">
        <div className="atlas-intro">
          <h1>The whole sky</h1>
          <p>
            Our galaxy runs across the middle. Every point of light is SPHEREx data, here at {lambda || "one wavelength"}.{" "}
            {touch ? "Tap anywhere to aim the telescope there." : "Point anywhere to read where it is, then choose a spot to look closer."}
          </p>
        </div>

        <div className="atlas-controls">
          <div
            className="wave"
            role="group"
            aria-label="Wavelength"
            onPointerEnter={() => atlas?.frames.forEach((f) => void loadGray(atlasUrl(small ? f.small : f.image)).catch(() => undefined))}
          >
            <p className="wave-head">
              <span>Wavelength</span>
              <b>{lambda}</b>
            </p>
            <div className="wave-bands">
              {atlas?.frames.map((f, i) => (
                <button
                  key={f.band}
                  type="button"
                  aria-pressed={f.band === frame?.band}
                  aria-label={`${f.lambda_um.toFixed(2)} micrometres`}
                  data-loading={loadingBand === f.band && painted.current !== undefined}
                  title={`${f.lambda_um.toFixed(2)} µm`}
                  style={{ flexGrow: f.band_max_um - f.band_min_um, flexBasis: 0 }}
                  onClick={() => p.onBand(f.band)}
                >
                  <span aria-hidden="true">{i + 1}</span>
                </button>
              ))}
            </div>
            <p className="wave-scale" aria-hidden="true">
              <span>0.75</span>
              <span>5 µm</span>
            </p>
          </div>

          <div className="atlas-tools">
            <button type="button" className="pill" aria-pressed={p.lines} onClick={() => p.onLines(!p.lines)}>
              Constellations
            </button>
            <div className="atlas-looks" role="group" aria-label="Look">
              {LOOKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === look}
                  aria-label={`${l.name} look`}
                  title={l.name}
                  style={{ background: lookGradient(l.id, "135deg") }}
                  onClick={() => p.onPalette(l.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <button type="button" className="pill pill-accent atlas-tour" onClick={p.onTour}>
          Show me a moving star
          <ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
