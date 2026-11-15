// Membuat gambar pratinjau tautan (Open Graph) untuk halaman kartu, dan teksnya.
//
// Tiap gambar adalah tangkapan layar halaman kartu yang sebenarnya pada 1200 x 630, jadi
// pratinjau di WhatsApp dan tempat lain memperlihatkan persis yang akan dibuka. Hasilnya:
//   public/og/<target>-<jenis>.jpg   satu per kartu contoh
//   public/og/card.jpg               kartu tertelungkup, untuk tempat di luar contoh
//   public/og/swara.jpg              landing page, untuk tautan situs lainnya
//   api/_cards.js                    judul dan keterangan tiap kartu, dibaca api/card.js
//
// Jalankan ulang kalau bundle contoh atau tampilan kartu berubah. Butuh Playwright (tidak
// termasuk dependensi proyek) dan server dev yang sedang jalan:
//   NODE_PATH=<folder node_modules berisi playwright> node scripts/og-cards.cjs [http://localhost:5183]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:5183";
const web = path.resolve(__dirname, "..");
const out = path.join(web, "public", "og");
const KINDS = ["motion", "light", "place"];
// Yang hanya berguna saat halaman dipakai: disembunyikan di gambar.
const QUIET = `.cp-top-link, .cp-kinds, .cp-actions, .cp-tools, .cp-foot { display: none !important; }
  .cp-main { gap: 70px !important; } .cp h1 { font-size: 50px !important; } .cp h1[data-long="true"] { font-size: 36px !important; }
  .cp-line { font-size: 23px !important; } .cp-note { font-size: 16.5px !important; }`;

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 88 });
  const index = JSON.parse(fs.readFileSync(path.resolve(web, "..", "bundles", "index.json"), "utf8"));
  const cards = {};

  for (const target of index.targets) {
    cards[target.id] = { name: target.name, kinds: {} };
    for (const kind of KINDS) {
      const page = await ctx.newPage();
      await page.goto(`${base}/card?target=${target.id}&card=${kind}`, { waitUntil: "networkidle" });
      await page.waitForSelector('.cp[data-arrived="true"]', { timeout: 30000 });
      // Jenis yang tidak ada untuk benda ini jatuh ke kartu pertamanya; yang itu dilewati.
      const shown = new URL(page.url()).searchParams.get("card");
      const pressed = await page.locator('.cp-kinds button[aria-pressed="true"]').innerText().catch(() => "");
      const actual = pressed.toLowerCase().includes("light") ? "light" : pressed.toLowerCase().includes("place") ? "place" : "motion";
      if (shown !== kind || actual !== kind) {
        await page.close();
        continue;
      }
      await page.addStyleTag({ content: QUIET });
      await page.mouse.move(430, 250);
      await page.waitForTimeout(3600);
      const line = (await page.locator(".cp-line").innerText()).trim();
      const note = (await page.locator(".cp-note").innerText()).trim();
      cards[target.id].kinds[kind] = { line, note };
      await shot(page, `${target.id}-${kind}`);
      console.log(target.id, kind, "|", line);
      await page.close();
    }
  }

  // Kartu tertelungkup: bundle tidak pernah tiba, jadi halaman tetap di keadaan menunggu.
  {
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.abort());
    await page.goto(`${base}/card?ra=0&dec=0`, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `${QUIET} .cp[data-status] .cp-rings { opacity: 1 !important; } .cp-side > * { display: none !important; }
        .cp-side::after { content: "A card was drawn from the sky."; display: block; font-family: "Archivo Variable", sans-serif; font-size: 44px; font-weight: 600; line-height: 1.08; font-stretch: 125%; max-width: 480px; letter-spacing: 0.03em; text-transform: uppercase; color: #f2efe8; }
        .cp-main::after { content: "TURN IT OVER  ·  SWARA-NASA.VERCEL.APP"; position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font: 500 12px "IBM Plex Mono", monospace; letter-spacing: 0.2em; color: #ffb454; }`,
    });
    await page.waitForTimeout(2500);
    await shot(page, "card");
    await page.close();
  }

  // Landing page untuk tautan situs lainnya.
  {
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);
    await shot(page, "swara");
    await page.close();
  }

  fs.writeFileSync(
    path.join(web, "api", "_cards.js"),
    `// Dibuat oleh scripts/og-cards.cjs dari halaman kartu contoh; jangan diubah dengan tangan.\nexport default ${JSON.stringify(cards, null, 2)};\n`,
  );
  await browser.close();
})();
