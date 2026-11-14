"""CLI: bangun bundle untuk satu koordinat atau untuk daftar preset.

  skychange build --id barnard --name "Barnard's Star" --ra 269.4463 --dec 4.7679
  skychange presets            # semua target di presets.json
  skychange presets barnard    # hanya yang disebut
  skychange index              # tulis ulang bundles/index.json
  skychange serve              # API koordinat bebas untuk viewer (lihat server.py)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .bundle import build

ROOT = Path(__file__).resolve().parents[3]  # folder repo
PRESETS = ROOT / "pipeline" / "presets.json"


def _summary(result: dict) -> None:
    m, s = result["manifest"], result["spectrum"]
    for w in m["windows"]:
        tag = "" if w["main"] else "  (kunjungan kecil)"
        print(f"  {w['id']}: {w['date_start']} s.d. {w['date_end']}, {w['n_exposures']} eksposur{tag}")
    for mv in m["motion"]:
        print(
            f"  gerak {mv['window']}: timur {mv['d_east_arcsec']:+.1f}\"  utara {mv['d_north_arcsec']:+.1f}\""
            f"  (sebaran {mv['scatter_arcsec']}\", n={mv['n']})"
        )
    pts = s["points"]
    by_flag = {f: sum(p["flag"] == f for p in pts) for f in ("ok", "saturated", "saturated_core", "bad_pixel")}
    det = sum(p["detected"] for p in pts)
    print(f"  spektrum: {len(pts)} titik, terdeteksi {det}, {by_flag}")
    print(f"  frame: {len(m['frames'])}, gagal unduh: {len(result['failed'])}, waktu: {result['timing']}")


def write_index(out: Path) -> Path:
    """Daftar preset yang bundelnya sudah ada; dibaca viewer saat mulai."""
    targets = [
        {k: t[k] for k in ("id", "name", "kind", "ra", "dec")}
        for t in json.loads(PRESETS.read_text())["targets"]
        if (out / t["id"] / "manifest.json").exists()
    ]
    path = out / "index.json"
    path.write_text(json.dumps({"targets": targets}, indent=1))
    return path


def main() -> None:
    ap = argparse.ArgumentParser(prog="skychange")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="satu koordinat")
    b.add_argument("--id", required=True)
    b.add_argument("--name", required=True)
    b.add_argument("--ra", type=float, required=True)
    b.add_argument("--dec", type=float, required=True)
    p = sub.add_parser("presets", help="target di presets.json")
    p.add_argument("ids", nargs="*")
    i = sub.add_parser("index", help="tulis ulang bundles/index.json")
    i.add_argument("--out", type=Path, default=ROOT / "bundles")
    v = sub.add_parser("serve", help="API koordinat bebas")
    v.add_argument("--host", default="127.0.0.1")
    v.add_argument("--port", type=int, default=8000)
    v.add_argument("--bundles", type=Path, default=ROOT / "data" / "bundles", help="bundle koordinat bebas")
    v.add_argument("--cache", type=Path, default=ROOT / "data" / "cache")
    for s in (b, p):
        s.add_argument("--fov", type=float, default=120.0, help="lebar medan, detik busur")
        s.add_argument("--out", type=Path, default=ROOT / "bundles")
        s.add_argument("--cache", type=Path, default=ROOT / "data" / "cache")
    a = ap.parse_args()

    if a.cmd == "index":
        print(write_index(a.out))
        return
    if a.cmd == "serve":
        import logging

        import uvicorn

        from .server import create_app

        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
        uvicorn.run(create_app(a.bundles, a.cache), host=a.host, port=a.port)
        return
    if a.cmd == "build":
        targets = [{"id": a.id, "name": a.name, "ra": a.ra, "dec": a.dec}]
    else:
        targets = [t for t in json.loads(PRESETS.read_text())["targets"] if not a.ids or t["id"] in a.ids]
    for t in targets:
        try:
            _summary(build(t["id"], t["name"], t["ra"], t["dec"], a.out, a.cache, fov_arcsec=a.fov))
        except Exception as err:
            print(f"[{t['id']}] GAGAL: {type(err).__name__}: {err}")
    write_index(a.out)


if __name__ == "__main__":
    main()
