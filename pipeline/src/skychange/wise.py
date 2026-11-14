"""Riwayat WISE 2010-2024 untuk satu posisi: deretan citra W2 dari layanan WiseView.

SPHEREx baru punya 3-4 kunjungan per posisi. WISE memotret langit yang sama sejak
2010, di panjang gelombang yang bertumpang dengan band SPHEREx terpanjang (W2 = 4,6
mikron), jadi gerak yang hanya sekitar satu piksel di SPHEREx terlihat jelas di sini.

Sumbernya layanan di balik WiseView (byw.tools/wiseview, proyek Backyard Worlds:
Planet 9), yang menyajikan koad unWISE per epoch sebagai PNG yang sudah diregangkan.
Citra ini untuk dilihat, bukan untuk diukur: nilainya bukan fluks.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from astropy.time import Time
from astropy.wcs import WCS

API_URL = "https://vjxontvb73.execute-api.us-west-2.amazonaws.com/png-animation"
IMAGE_URL = "https://amnh-citsci-public.s3-us-west-2.amazonaws.com/"
PIXEL_ARCSEC = 2.75  # skala piksel unWISE
BAND = {"id": "W2", "label": "WISE W2", "lambda_um": 4.6}
# Rentang regangan linier dalam satuan unWISE; sama untuk semua posisi dan epoch,
# supaya terang antar epoch bisa dibandingkan dengan mata.
MIN_BRIGHT, MAX_BRIGHT = -50.0, 500.0


def _params(ra: float, dec: float, size: int) -> dict:
    # Sama dengan yang dikirim antarmuka WiseView pada pengaturan bawaannya.
    off = {k: 0 for k in ("max_dyr", "invert", "diff", "scandir", "outer", "neowise", "smooth_scan", "shift")}
    synth = {}
    for s in ("a", "b"):
        synth |= {f"synth_{s}": 0, f"synth_{s}_sub": 0, f"synth_{s}_pmra": 0, f"synth_{s}_pmdec": 0}
        synth |= {f"synth_{s}_{k}": "" for k in ("ra", "dec", "w1", "w2", "mjd")}
    return {
        "ra": ra,
        "dec": dec,
        "band": 2,
        "size": size,
        "minbright": f"{MIN_BRIGHT:.4f}",
        "maxbright": f"{MAX_BRIGHT:.4f}",
        "stretch": 1,
        "window": 0.5,
        "diff_window": 1,
        "unique": 1,
        "pmx": 0,
        "pmy": 0,
        **off,
        **synth,
    }


def _date(mjd: float) -> str:
    return Time(mjd, format="mjd").iso[:10]


def target_pixel(meta: dict, ra: float, dec: float) -> tuple[float, float]:
    """Letak (ra, dec) di PNG, dalam piksel dari kiri atas.

    Layanan memberi WCS petak unWISE relatif terhadap potongan (CRPIX, CRVAL). PNG
    sudah menghadap utara ke atas, jadi sumbu y FITS dibalik.
    """
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crpix = [meta["CRPIX1"], meta["CRPIX2"]]
    w.wcs.crval = [meta["CRVAL1"], meta["CRVAL2"]]
    w.wcs.cdelt = [-PIXEL_ARCSEC / 3600, PIXEL_ARCSEC / 3600]
    x, y = w.all_world2pix(ra, dec, 0)
    return float(x), float(meta["NAXIS2"] - 1 - y)


def build_wise(ra: float, dec: float, out: Path, fov_arcsec: float, log=print, timeout: float = 60.0) -> dict | None:
    """Unduh deretan citra W2 selebar `fov_arcsec` ke `out/wise/` dan kembalikan
    entri manifest-nya; None kalau layanan tidak punya data di posisi ini."""
    size = math.ceil(fov_arcsec / PIXEL_ARCSEC)
    size += 1 - size % 2  # ganjil, supaya posisi jatuh di tengah satu piksel
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(API_URL, params=_params(ra, dec, size))
        r.raise_for_status()
        meta = r.json()
        keys = meta.get("ims") or []
        if not keys:
            return None

        folder = out / "wise"
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.png"):
            old.unlink()

        def grab(job: tuple[int, str]) -> None:
            i, key = job
            g = client.get(IMAGE_URL + key)
            g.raise_for_status()
            (folder / f"{i + 1:02d}.png").write_bytes(g.content)

        with ThreadPoolExecutor(6) as pool:
            list(pool.map(grab, enumerate(keys)))

    x, y = target_pixel(meta, ra, dec)
    frames = []
    for i, mjds in enumerate(meta["mjds"]):
        frames.append(
            {
                "id": f"x{i + 1}",
                "image": f"wise/{i + 1:02d}.png",
                "mjd_mid": round(sum(mjds) / len(mjds), 4),
                "date_start": _date(min(mjds)),
                "date_end": _date(max(mjds)),
                "n_epochs": len(mjds),
            }
        )
    log(f"  WISE: {len(frames)} citra W2, {frames[0]['date_start']} s.d. {frames[-1]['date_end']}")
    return {
        "band": BAND,
        "pixel_arcsec": PIXEL_ARCSEC,
        "size_px": [int(meta["NAXIS1"]), int(meta["NAXIS2"])],
        "target_px": [round(x, 2), round(y, 2)],
        "orientation": "north up, east left",
        "stretch": f"linear, {MIN_BRIGHT:g} to {MAX_BRIGHT:g} unWISE units; for viewing, not photometry",
        "frames": frames,
        "source": {
            "mission": "WISE / NEOWISE",
            "product": "unWISE time-resolved coadds",
            "service": "WiseView (Backyard Worlds: Planet 9)",
            "url": "http://byw.tools/wiseview",
        },
    }
