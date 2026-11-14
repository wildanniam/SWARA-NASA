// Dua halaman dalam satu situs: landing page di "/", aplikasi di "/sky".
// Tautan lama ke satu tempat ("/?target=barnard", "/?ra=…&dec=…") tetap membuka aplikasi,
// karena kartu berbagi dan kode QR yang sudah tersebar memakai bentuk itu.

export const APP_PATH = "/sky";

/** Parameter yang hanya dipakai aplikasi; salah satunya ada berarti tautan ke aplikasi. */
const APP_KEYS = ["target", "ra", "dec", "name", "band", "look", "view"];

export function isAppRoute(loc: Location = window.location): boolean {
  if (loc.pathname.replace(/\/+$/, "") === APP_PATH) return true;
  const query = new URLSearchParams(loc.search);
  return APP_KEYS.some((key) => query.has(key));
}

export const placeHref = (id: string) => `${APP_PATH}?target=${encodeURIComponent(id)}`;
