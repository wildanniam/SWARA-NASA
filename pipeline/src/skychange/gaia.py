"""Bintang Gaia DR3 di sekitar satu posisi, untuk ditimpakan di lensa viewer.

Diambil dari arsip Gaia ESA lewat TAP (sekitar 3 detik per posisi, diukur
2026-11-14). Arsip itu tidak mengizinkan panggilan langsung dari browser, jadi
pengambilannya di sini dan hasilnya disimpan sebagai `gaia.json` di bundle.

Tiap bintang membawa gerak dirinya, sehingga viewer bisa menaruhnya di posisi
pada tanggal citra yang sedang tampil, bukan di posisi katalog tahun 2016.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync"
EPOCH = 2016.0  # epoch posisi Gaia DR3, tahun Julian
MAX_STARS = 400  # yang paling terang lebih dulu; medan padat dipotong di sini
# Bintang cepat bisa berada di luar medan pada 2016 tetapi di dalamnya pada 2010 atau
# 2026: 10 detik busur per tahun selama 10 tahun = 100 detik busur.
MARGIN_ARCSEC = 120.0


def fetch_stars(ra: float, dec: float, radius_arcsec: float) -> list[list]:
    """[ra, dec, pmra, pmdec, G, source_id] per bintang, dari yang paling terang.
    ra dan dec dalam derajat pada epoch 2016.0; pmra (sudah dikali cos dec) dan pmdec
    dalam milidetik busur per tahun, None kalau Gaia tidak mengukurnya."""
    query = (
        f"SELECT TOP {MAX_STARS} ra, dec, pmra, pmdec, phot_g_mean_mag, source_id "
        "FROM gaiadr3.gaia_source "
        f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra:.6f},{dec:.6f},{radius_arcsec / 3600:.6f})) "
        "AND phot_g_mean_mag IS NOT NULL ORDER BY phot_g_mean_mag"
    )
    r = httpx.get(
        TAP_URL,
        params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": query},
        timeout=60,
        follow_redirects=True,
    )
    r.raise_for_status()
    rows = r.json()["data"]
    num = lambda v, d: None if v is None else round(float(v), d)  # noqa: E731
    return [[num(a, 7), num(d, 7), num(pa, 2), num(pd, 2), num(g, 2), str(sid)] for a, d, pa, pd, g, sid in rows]


def build_gaia(ra: float, dec: float, out: Path, fov_arcsec: float) -> dict:
    """Tulis `gaia.json` ke folder bundle dan kembalikan ringkasannya untuk manifest."""
    radius = fov_arcsec * 0.7072 + MARGIN_ARCSEC  # setengah diagonal medan, plus cadangan
    stars = fetch_stars(ra, dec, radius)
    doc = {
        "catalogue": "Gaia DR3",
        "source": "ESA Gaia Archive, gaiadr3.gaia_source",
        "epoch": EPOCH,
        "radius_arcsec": round(radius, 1),
        "columns": ["ra_deg", "dec_deg", "pmra_mas_yr", "pmdec_mas_yr", "g_mag", "source_id"],
        "stars": stars,
    }
    (out / "gaia.json").write_text(json.dumps(doc, separators=(",", ":"), allow_nan=False))
    return {
        "file": "gaia.json",
        "n": len(stars),
        # Medan padat dipotong di MAX_STARS: yang lebih redup dari ini tidak ikut.
        "truncated": len(stars) >= MAX_STARS,
        "faintest_g_mag": stars[-1][4] if stars else None,
    }
