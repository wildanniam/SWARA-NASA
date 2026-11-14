import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Bundle hasil pipeline ada di ../bundles (satu sumber, tidak disalin ke repo dua kali).
// Dev: dilayani langsung di /bundles. Build: disalin ke dist/bundles.
const BUNDLES = resolve(import.meta.dirname, "../bundles");
const TYPES: Record<string, string> = { ".json": "application/json", ".png": "image/png" };

function bundles(): Plugin {
  return {
    name: "sky-bundles",
    configureServer(server) {
      server.middlewares.use("/bundles", (req, res) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = resolve(BUNDLES, "." + rel);
        const inside = file.startsWith(BUNDLES + sep);
        if (!inside || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      cpSync(BUNDLES, resolve(import.meta.dirname, "dist/bundles"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), bundles()],
  server: { port: 5183, strictPort: true },
});
