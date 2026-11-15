// Bahan satu kartu, dimuat tanpa aplikasi: dipakai halaman kartu (/card), yang dibuka dari
// tautan berbagi. Isinya sama dengan yang disusun aplikasi untuk dialog "Draw a card".

import { BLENDED } from "../content";
import { atlasUrl, loadAtlas } from "./allsky";
import { assetUrl, defaultBand, findFrame, loadIndex, loadManifest, loadSpectrum } from "./bundle";
import type { CardInput, CardKind } from "./card";
import { coordShort } from "./format";
import type { PaletteId } from "./palette";
import { requestSky } from "./sky";
import { loadGray } from "./skyimage";
import { WISE_SOFTEN_ARCSEC, wiseTone } from "./tone";
import { APP_PATH, CARD_PATH } from "../route";

/** Tempat yang ditunjuk tautan: salah satu contoh, atau posisi (dan nama) yang dicari orang. */
export type CardPlace = { target?: string; ra?: number; dec?: number; name?: string };

/** Nama jenis kartu di tautan. */
export const KIND_SLUG: Record<CardKind, string> = { wanderer: "motion", voice: "light", place: "place" };
export const kindFromSlug = (slug: string | null): CardKind | undefined =>
  (Object.keys(KIND_SLUG) as CardKind[]).find((k) => KIND_SLUG[k] === slug);

/** Bundle tempat ini belum selesai dibuat, jadi kartunya belum bisa dilukis. */
export class CardNotReady extends Error {}

const image = (url: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = url;
  });

function placeQuery(place: CardPlace): URLSearchParams {
  const q = new URLSearchParams();
  if (place.target) q.set("target", place.target);
  else {
    if (place.ra !== undefined && place.dec !== undefined) {
      q.set("ra", place.ra.toFixed(4));
      q.set("dec", place.dec.toFixed(4));
    }
    if (place.name) q.set("name", place.name);
  }
  return q;
}

/** Tautan ke halaman kartu untuk tempat yang ditunjuk tautan aplikasi `appUrl`. */
export function cardUrl(appUrl: string, kind: CardKind, look: PaletteId): string {
  const url = new URL(appUrl);
  const q = new URLSearchParams();
  for (const key of ["target", "ra", "dec", "name"]) {
    const v = url.searchParams.get(key);
    if (v) q.set(key, v);
  }
  q.set("card", KIND_SLUG[kind]);
  if (look !== "heat") q.set("look", look);
  return `${url.origin}${CARD_PATH}?${q}`;
}

export type CardLoad = { input: CardInput; id: string; custom: boolean };

export async function loadCardInput(place: CardPlace, look: PaletteId): Promise<CardLoad> {
  let id: string;
  let custom = false;
  let name: string;
  let cataloguePm: number | null | undefined;
  let linked = place;
  if (place.target) {
    const ref = (await loadIndex()).find((t) => t.id === place.target);
    if (!ref) throw new Error(`unknown target ${place.target}`);
    id = ref.id;
    name = ref.name;
  } else {
    const query = place.name || (place.ra !== undefined && place.dec !== undefined ? `${place.ra} ${place.dec}` : "");
    if (!query) throw new Error("no place in link");
    const job = await requestSky(query);
    if (job.status !== "ready") throw new CardNotReady();
    id = job.id;
    custom = true;
    name = job.label || coordShort(job.ra, job.dec);
    cataloguePm = job.pm_arcsec_yr;
    linked = { ra: job.ra, dec: job.dec, name: job.label ?? undefined };
  }

  const manifest = await loadManifest(id, custom);
  if (manifest.preview) throw new CardNotReady();

  const band = defaultBand(manifest);
  const window = [...manifest.windows].reverse().find((w) => findFrame(manifest, w.id, band));
  const frame = window ? findFrame(manifest, window.id, band) : undefined;
  const wise = manifest.wise ?? undefined;

  const [points, sky, context, frameImage, wiseLoaded] = await Promise.all([
    loadSpectrum(id, custom)
      .then((s) => s.points)
      .catch(() => undefined),
    loadAtlas()
      .then(async (atlas) => {
        const map = atlas.frames.find((f) => f.band === atlas.default_band) ?? atlas.frames[0];
        return { atlas, gray: await loadGray(atlasUrl(map.image)) };
      })
      .catch(() => undefined),
    manifest.context ? image(assetUrl(id, custom, manifest.context.image)) : undefined,
    frame ? image(assetUrl(id, custom, frame.image)) : undefined,
    Promise.all((wise?.frames ?? []).map((f) => image(assetUrl(id, custom, f.image)))),
  ]);
  const wiseImages = wiseLoaded.filter((img): img is HTMLImageElement => !!img);
  if (!wiseImages.length && !frameImage) throw new Error("no images for this card");

  const input: CardInput = {
    name,
    manifest,
    look,
    url: `${location.origin}${APP_PATH}?${placeQuery(linked)}`,
    site: location.host,
    context,
    wiseImages,
    wiseTone: wise && !wise.matched && wiseImages[0] ? wiseTone(id, wiseImages[0], WISE_SOFTEN_ARCSEC / wise.pixel_arcsec) : undefined,
    frame: frameImage && frame && window ? { image: frameImage, bandId: frame.band, mjd: window.mjd_mid } : undefined,
    points,
    blended: custom ? undefined : BLENDED[id],
    cataloguePm,
    sky,
    today: new Date(),
  };
  return { input, id, custom };
}
