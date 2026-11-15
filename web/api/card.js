// Halaman kartu (/card) dengan pratinjau tautannya sendiri.
//
// WhatsApp dan layanan lain membaca tag Open Graph tanpa menjalankan JavaScript, jadi tag
// itu harus sudah ada di HTML. Berkas ini mengambil index.html situs dan mengganti blok
// pratinjaunya: kartu contoh mendapat gambar dan kalimatnya sendiri (public/og, _cards.js,
// dibuat scripts/og-cards.cjs); tempat lain mendapat kartu tertelungkup dan namanya.

import cards from "./_cards.js";

const KINDS = ["motion", "light", "place"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const one = (v) => (Array.isArray(v) ? v[0] : v);

let shell;
async function page(origin) {
  if (shell) return shell;
  const res = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`index.html: HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes("<!--og-->")) throw new Error("index.html has no preview block");
  shell = html;
  return html;
}

function preview(query, origin) {
  const target = one(query.target);
  const known = typeof target === "string" ? cards[target] : undefined;
  let title = "A card from the sky";
  let description = "Someone drew a card from the sky with SWARA. Turn it over, then draw your own.";
  let image = "card";
  if (known) {
    const asked = one(query.card);
    const kind = KINDS.includes(asked) && known.kinds[asked] ? asked : Object.keys(known.kinds)[0];
    const text = known.kinds[kind];
    title = `${known.name}: a card from the sky`;
    description = `${text.line} ${text.note}`;
    image = `${target}-${kind}`;
  } else {
    const name = String(one(query.name) ?? "").trim().slice(0, 80);
    // Nama ditulis seperti di halaman kartunya: huruf pertama tiap kata besar.
    if (name) title = `${name.replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase())}: a card from the sky`;
  }
  return { title, description, image: `${origin}/og/${image}.jpg` };
}

export default async function handler(req, res) {
  // Alamat situs dari pengaturan Vercel, bukan dari header permintaan: kerangka HTML diambil
  // dari alamat ini, jadi tidak boleh bisa diarahkan pengirim permintaan.
  const origin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host}`;
  const { title, description, image } = preview(req.query, origin);
  const search = new URLSearchParams();
  for (const key of ["target", "ra", "dec", "name", "card", "look"]) {
    const v = one(req.query[key]);
    if (typeof v === "string" && v) search.set(key, v.slice(0, 80));
  }
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="SWARA" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(`${origin}/card?${search}`)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");

  res.setHeader("content-type", "text/html; charset=utf-8");
  try {
    const html = (await page(origin))
      .replace(/<!--og-->[\s\S]*?<!--\/og-->/, tags)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)} · SWARA</title>`);
    res.setHeader("cache-control", "public, max-age=0, s-maxage=600");
    res.status(200).send(html);
  } catch {
    // Kerangka situs tidak terambil: pratinjaunya tetap dikirim, dan orang yang membuka
    // tautannya diantar ke tempat itu di aplikasi.
    res.setHeader("cache-control", "no-store");
    res.status(200).send(
      `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>${esc(title)} · SWARA</title>\n    ${tags}\n` +
        `<meta http-equiv="refresh" content="0; url=/sky?${esc(search.toString())}" /></head><body></body></html>`,
    );
  }
}
