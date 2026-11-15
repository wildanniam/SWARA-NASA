// Empat halaman dalam satu situs: landing page di "/", aplikasi di "/sky", satu kartu di "/card",
// dan penjelasan misi SPHEREx di "/spherex".
// Tautan lama ke satu tempat ("/?target=barnard", "/?ra=…&dec=…") tetap membuka aplikasi,
// karena kartu berbagi dan kode QR yang sudah tersebar memakai bentuk itu.

export const APP_PATH = "/sky";
/** Halaman satu kartu, tujuan tautan berbagi. Diperiksa lebih dulu dari aplikasi, karena
 *  tautannya memakai parameter tempat yang sama ("target", "ra", "dec", "name"). */
export const CARD_PATH = "/card";

export const isCardRoute = (loc: Location = window.location) => loc.pathname.replace(/\/+$/, "") === CARD_PATH;

/** Halaman penjelasan misi SPHEREx, dibuka dari bilah atas aplikasi. */
export const SPHEREX_PATH = "/spherex";

export const isSpherexRoute = (loc: Location = window.location) => loc.pathname.replace(/\/+$/, "") === SPHEREX_PATH;

/** Parameter yang hanya dipakai aplikasi; salah satunya ada berarti tautan ke aplikasi. */
const APP_KEYS = ["target", "ra", "dec", "name", "band", "look", "view"];

export function isAppRoute(loc: Location = window.location): boolean {
  if (loc.pathname.replace(/\/+$/, "") === APP_PATH) return true;
  const query = new URLSearchParams(loc.search);
  return APP_KEYS.some((key) => query.has(key));
}

export const placeHref = (id: string) => `${APP_PATH}?target=${encodeURIComponent(id)}`;
