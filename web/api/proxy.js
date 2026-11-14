// Penerus /api ke layanan SWARA di server tim. Alamat dan kuncinya diisi di
// pengaturan proyek Vercel (SWARA_API_ORIGIN, SWARA_API_KEY), tidak di repo.
// vercel.json mengarahkan semua /api/... ke berkas ini.

const HOP = new Set(["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding"]);

export default async function handler(req, res) {
  const origin = process.env.SWARA_API_ORIGIN;
  if (!origin) {
    res.status(503).json({ detail: "The search service is not configured." });
    return;
  }
  // Jalur asli datang sebagai parameter `path` dari aturan rewrite.
  const raw = req.query.path;
  const path = (Array.isArray(raw) ? raw.join("/") : String(raw ?? "")).replace(/^\/+/, "");
  if (!/^(sky(\/[\w.+-]+)?|bundles\/[\w.+-]+\/[\w./-]+)$/.test(path) || path.includes("..")) {
    res.status(404).json({ detail: "Not found" });
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  const init = { method: req.method, headers: { "x-swara-key": process.env.SWARA_API_KEY ?? "" } };
  if (req.method === "POST") {
    init.headers["content-type"] = "application/json";
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  }

  let upstream;
  try {
    upstream = await fetch(`${origin.replace(/\/+$/, "")}/api/${path}`, { ...init, signal: AbortSignal.timeout(25000) });
  } catch {
    res.status(503).json({ detail: "The search service is not reachable right now. The examples still work." });
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (!HOP.has(name) && name !== "cache-control") res.setHeader(name, value);
  });
  // Berkas bundle yang sudah jadi tidak berubah, jadi boleh disimpan CDN;
  // keadaan pekerjaan harus selalu segar.
  const cacheable = upstream.ok && path.startsWith("bundles/");
  res.setHeader("cache-control", cacheable ? "public, max-age=300, s-maxage=3600" : "no-store");
  res.send(Buffer.from(await upstream.arrayBuffer()));
}
