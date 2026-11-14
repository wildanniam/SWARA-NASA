"""Riwayat WISE 2010-2024 untuk satu posisi: deretan citra W2 dari layanan WiseView.

SPHEREx baru punya 3-4 kunjungan per posisi. WISE memotret langit yang sama sejak
2010, di panjang gelombang yang bertumpang dengan band SPHEREx terpanjang (W2 = 4,6
mikron), jadi gerak yang hanya sekitar satu piksel di SPHEREx terlihat jelas di sini.

Sumbernya layanan di balik WiseView (byw.tools/wiseview, proyek Backyard Worlds:
Planet 9), yang menyajikan koad unWISE per epoch sebagai PNG yang sudah diregangkan.
Citra ini untuk dilihat, bukan untuk diukur: nilainya bukan fluks.

Supaya deretan WISE lalu SPHEREx tidak meloncat tampilannya, citra WISE ditulis ulang
dengan aturan yang sama dengan frame SPHEREx. Layanan diminta mengirim rentang terang
yang lebar dengan regangan asinh (rumusnya diperiksa: cocok dengan AsinhStretch astropy
dalam satu tingkat abu), lalu di sini citranya dikembalikan ke satuan aslinya,
dihaluskan sedikit ke ketajaman frame SPHEREx, latarnya dikurangi, dan diregangkan
dengan `frames.stretch`: lutut 3 kali derau latar, sama untuk semua epoch.
"""

from __future__ import annotations

import io
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image

from . import frames as fr

API_URL = "https://vjxontvb73.execute-api.us-west-2.amazonaws.com/png-animation"
IMAGE_URL = "https://amnh-citsci-public.s3-us-west-2.amazonaws.com/"
PIXEL_ARCSEC = 2.75  # skala piksel unWISE
BAND = {"id": "W2", "label": "WISE W2", "lambda_um": 4.6}
# Yang diminta dari layanan: rentang lebar dalam satuan unWISE dengan regangan asinh,
# supaya latar tetap halus (sekitar 2,7 satuan per tingkat abu) dan bintang terang
# tidak terpotong. Sama untuk semua posisi dan epoch.
MIN_BRIGHT, MAX_BRIGHT, ASINH_A = -50.0, 50000.0, 0.002
# Frame SPHEREx yang sudah disusun punya lebar bintang sekitar 9,5 detik busur; WISE
# 6,4. Penghalusan Gauss ini (simpangan baku, detik busur) menyetarakannya:
# akar(9,5^2 - 6,4^2) / 2,355.
SOFTEN_ARCSEC = 3.0


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
        "stretch": ASINH_A,
        "window": 0.5,
        "diff_window": 1,
        "unique": 1,
        "pmx": 0,
        "pmy": 0,
        **off,
        **synth,
    }


def to_units(gray: np.ndarray) -> np.ndarray:
    """Kebalikan regangan layanan: tingkat abu 0-255 kembali ke satuan unWISE."""
    x = ASINH_A * np.sinh(gray / 255.0 * np.arcsinh(1.0 / ASINH_A))
    return MIN_BRIGHT + x * (MAX_BRIGHT - MIN_BRIGHT)


def soften(image: np.ndarray, sigma_px: float) -> np.ndarray:
    """Penghalusan Gauss terpisah per sumbu; tepi diperpanjang dengan nilai tepinya."""
    if sigma_px <= 0:
        return image
    r = max(1, int(math.ceil(4 * sigma_px)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_px) ** 2)
    k /= k.sum()
    out = np.pad(image, r, mode="edge")
    out = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, out)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, out)


def fill_cores(units: np.ndarray, gray: np.ndarray) -> np.ndarray:
    """Inti bintang yang jenuh tidak punya nilai di koad unWISE dan tampil sebagai
    lubang gelap di tengah bintang paling terang. Piksel tanpa nilai yang bertetangga
    dengan piksel sangat terang diisi terang penuh, diulang dari tepi ke tengah;
    sama dengan perlakuan inti jenuh di citra SPHEREx."""
    image = units.copy()
    # Piksel tanpa nilai bernilai tepat 0 satuan; setelah regangan layanan itu satu
    # tingkat abu tertentu (dibulatkan ke bawah atau ke atas).
    zero = 255 * np.arcsinh(-MIN_BRIGHT / (ASINH_A * (MAX_BRIGHT - MIN_BRIGHT))) / np.arcsinh(1 / ASINH_A)
    empty = np.abs(gray.astype(float) - zero) <= 1.0
    h, w = image.shape
    for _ in range(12):
        padded = np.pad(image, 2, constant_values=-np.inf)
        around = np.full(image.shape, -np.inf)
        for dy in range(5):
            for dx in range(5):
                around = np.maximum(around, padded[dy : dy + h, dx : dx + w])
        fill = empty & (around > 0.2 * MAX_BRIGHT)
        if not fill.any():
            break
        image[fill] = MAX_BRIGHT
        empty = empty & ~fill
    return image


def match_to_spherex(grays: list[np.ndarray]) -> tuple[list[np.ndarray], dict]:
    """Tulis ulang citra WISE dengan aturan tampilan frame SPHEREx. Mengembalikan
    citra 8-bit dan angka yang dipakai (satuan unWISE)."""
    images = [
        soften(fill_cores(to_units(g.astype(float)), g), SOFTEN_ARCSEC / PIXEL_ARCSEC) for g in grays
    ]
    values = np.concatenate([i.ravel() for i in images])
    sky = float(np.median(values))
    sigma = 1.4826 * float(np.median(np.abs(values - sky)))
    knee = max(3 * sigma, 1e-3)
    vmax = max(float(np.percentile(values - sky, 99.9)), 20 * knee)
    out = [fr.stretch(i - sky, knee, vmax) for i in images]
    return out, {"sky": round(sky, 2), "knee": round(knee, 2), "vmax": round(vmax, 1), "soften_arcsec": SOFTEN_ARCSEC}


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


def _coverage(meta: dict, ra: float, dec: float, half_px: float) -> tuple[float, float, float]:
    """Bagian medan yang tertutup citra (0-1), dan kekurangannya ke kanan dan ke bawah
    dalam piksel (negatif = kurang di kiri atau atas)."""
    x, y = target_pixel(meta, ra, dec)
    w, h = meta["NAXIS1"], meta["NAXIS2"]
    left, right = min(x + 0.5, half_px), min(w - x - 0.5, half_px)
    up, down = min(y + 0.5, half_px), min(h - y - 0.5, half_px)
    area = max(left + right, 0) * max(up + down, 0) / (2 * half_px) ** 2
    return area, (half_px - right) - (half_px - left), (half_px - down) - (half_px - up)


def build_wise(ra: float, dec: float, out: Path, fov_arcsec: float, log=print, timeout: float = 60.0) -> dict | None:
    """Unduh deretan citra W2 selebar `fov_arcsec` ke `out/wise/` dan kembalikan
    entri manifest-nya; None kalau layanan tidak punya data di posisi ini."""
    half_px = fov_arcsec / PIXEL_ARCSEC / 2
    size = math.ceil(fov_arcsec / PIXEL_ARCSEC)
    size += 1 - size % 2  # ganjil, supaya posisi jatuh di tengah satu piksel
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:

        def ask(ra0: float, dec0: float, n: int) -> dict:
            r = client.get(API_URL, params=_params(ra0, dec0, n))
            r.raise_for_status()
            return r.json()

        meta = ask(ra, dec, size)
        if not meta.get("ims"):
            return None
        # Layanan memotong dari satu petak unWISE, jadi di dekat tepi petak citranya
        # terpotong. Petak bersebelahan saling menumpuk beberapa menit busur: minta
        # ulang dengan pusat digeser ke arah yang terpotong supaya petak tetangga yang
        # dipakai, lalu ambil yang menutup medan paling banyak.
        area, dx, dy = _coverage(meta, ra, dec, half_px)
        if area < 0.98:
            push = lambda d: (abs(d) + 12) * (1 if d > 0 else -1) if abs(d) > 0.5 else 0.0
            sx, sy = push(dx), push(dy)
            ra2 = ra - sx * PIXEL_ARCSEC / 3600 / math.cos(math.radians(dec))  # kanan = barat
            dec2 = dec - sy * PIXEL_ARCSEC / 3600  # bawah = selatan
            n2 = size + 2 * math.ceil(max(abs(sx), abs(sy)))
            try:
                other = ask(ra2, dec2, n2 + 1 - n2 % 2)
                if other.get("ims") and _coverage(other, ra, dec, half_px)[0] > area:
                    meta = other
                    area = _coverage(meta, ra, dec, half_px)[0]
            except httpx.HTTPError:
                pass
        keys = meta["ims"]

        folder = out / "wise"
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.png"):
            old.unlink()

        def grab(key: str) -> np.ndarray:
            g = client.get(IMAGE_URL + key)
            g.raise_for_status()
            return np.asarray(Image.open(io.BytesIO(g.content)).convert("L"))

        with ThreadPoolExecutor(6) as pool:
            grays = list(pool.map(grab, keys))

    matched, display = match_to_spherex(grays)
    for i, image in enumerate(matched):
        Image.fromarray(image, "L").save(folder / f"{i + 1:02d}.png", optimize=True)

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
        "coverage": round(area, 3),
        "orientation": "north up, east left",
        "stretch": "asinh(v/knee)/asinh(vmax/knee) on sky-subtracted unWISE units, knee = 3x sky noise, "
        "same for all epochs; the same rule as the SPHEREx frames. For viewing, not photometry",
        # Viewer tidak perlu menyamakan nada lagi untuk citra yang sudah ditulis begini.
        "matched": True,
        "display": display,
        "frames": frames,
        "source": {
            "mission": "WISE / NEOWISE",
            "product": "unWISE time-resolved coadds",
            "service": "WiseView (Backyard Worlds: Planet 9)",
            "url": "http://byw.tools/wiseview",
        },
    }
