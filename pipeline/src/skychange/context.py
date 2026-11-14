"""Citra medan lebar di sekitar satu posisi: latar langit untuk viewer.

Frame blink hanya 2 menit busur, sekitar 20 piksel SPHEREx. Di sini potongan
yang jauh lebih lebar (40 menit busur) diambil dari eksposur yang sama, supaya
viewer bisa menampilkan langit di sekeliling target sebagai data asli, bukan
hiasan. Potongan selebar ini ratusan kali lebih besar, jadi hanya beberapa
eksposur dari satu detektor yang dibaca.

Ini citra untuk suasana dan orientasi, bukan untuk diukur: latar tiap eksposur
diratakan per baris dan kolom, dan tidak ada penanda piksel.
"""

from __future__ import annotations

import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

from . import frames as fr
from .fetch import DETECTOR_PX, Cutout
from .remote import Head, Layout
from .search import Exposure

FOV_ARCSEC = 2400.0
SIZE_PX = 720
MAX_EXPOSURES = 4  # dibatasi jaringan: tiap eksposur sekitar 5 MB
# Bintang paling banyak dan paling tajam di panjang gelombang pendek.
DETECTOR_ORDER = (2, 1, 3, 4, 5, 6)
PIXEL_ARCSEC = 6.15
# Potongan lebar adalah satu bacaan berurutan sekitar 4,5 MB. Blok 1 MB membuatnya
# beberapa permintaan saja (blok 64 KB untuk cutout kecil butuh puluhan), tanpa
# membuang banyak byte saat membaca header.
FSSPEC = {"block_size": 1024 * 1024, "cache_type": "bytes"}


def _wide_px() -> int:
    n = int(np.ceil(FOV_ARCSEC * np.sqrt(2) / PIXEL_ARCSEC)) + 1
    return n if n % 2 else n + 1


def _read_wide(exp: Exposure, ra: float, dec: float, n: int, cache: Path) -> dict | None:
    path = cache / f"{exp.key}.npz"
    if path.exists():
        with np.load(path) as z:
            return {k: z[k] for k in z.files}
    try:
        data = _wide_direct(exp, ra, dec, n)
    except Layout:
        data = _wide_lazy(exp, ra, dec, n)
    if data is None:
        return None
    tmp = path.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, **data)
    tmp.rename(path)
    return data


def _window(header, ra: float, dec: float, n: int):
    x, y = WCS(header).world_to_pixel_values(ra, dec)
    x0, y0 = int(round(float(x))) - n // 2, int(round(float(y))) - n // 2
    return x0, y0, max(x0, 0), min(x0 + n, DETECTOR_PX), max(y0, 0), min(y0 + n, DETECTOR_PX)


def _wide_direct(exp: Exposure, ra: float, dec: float, n: int) -> dict | None:
    """Dua permintaan: awal berkas, lalu baris-baris IMAGE dalam satu rentang."""
    head = Head(exp.url)
    x0, y0, xa, xb, ya, yb = _window(head.header, ra, dec, n)
    if xa >= xb or ya >= yb:
        return None
    image = np.full((n, n), np.nan, dtype=np.float32)
    image[ya - y0 : yb - y0, xa - x0 : xb - x0] = head.image_rows(ya, yb, xa, xb)
    return {"image": image, "x0": x0, "y0": y0, "header": head.header.tostring()}


def _wide_lazy(exp: Exposure, ra: float, dec: float, n: int) -> dict | None:
    """Cara lama lewat astropy dan fsspec, kalau susunan berkasnya berbeda."""
    with fits.open(exp.url, use_fsspec=True, fsspec_kwargs=FSSPEC) as hdul:
        header = hdul["IMAGE"].header
        x0, y0, xa, xb, ya, yb = _window(header, ra, dec, n)
        if xa >= xb or ya >= yb:
            return None
        image = np.full((n, n), np.nan, dtype=np.float32)
        image[ya - y0 : yb - y0, xa - x0 : xb - x0] = hdul["IMAGE"].section[ya:yb, xa:xb]
        return {"image": image, "x0": x0, "y0": y0, "header": header.tostring()}


def _flatten(image: np.ndarray) -> np.ndarray:
    """Buang latar yang berubah pelan di sepanjang detektor (cahaya zodiak yang
    berubah dengan panjang gelombang), per baris lalu per kolom."""
    im = image.astype(float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        im = im - np.nanmedian(im, axis=1, keepdims=True)
        im = im - np.nanmedian(im, axis=0, keepdims=True)
    return im


def build_context(cutouts: list[Cutout], ra: float, dec: float, out: Path, cache_root: Path, log=print) -> dict | None:
    """Tulis `context.png` ke folder bundle. Mengembalikan isian manifest, atau
    None kalau tidak ada eksposur yang bisa dipakai."""
    t0 = time.time()
    by_detector: dict[int, list[tuple[float, Exposure]]] = {}
    for c in cutouts:
        half = c.image.shape[0] // 2
        cx, cy = c.x0 + half, c.y0 + half
        # Makin jauh target dari tepi detektor, makin utuh potongan lebarnya.
        depth = min(cx, cy, DETECTOR_PX - cx, DETECTOR_PX - cy)
        by_detector.setdefault(c.exposure.detector, []).append((depth, c.exposure))
    detector = next((d for d in DETECTOR_ORDER if len(by_detector.get(d, [])) >= 2), None)
    if detector is None:
        return None
    chosen = [e for _, e in sorted(by_detector[detector], key=lambda p: -p[0])[:MAX_EXPOSURES]]
    return _render(detector, chosen, ra, dec, out, cache_root, log, t0)


def build_context_early(
    exposures: list[Exposure], ra: float, dec: float, out: Path, cache_root: Path, cutout_px: int, log=print
) -> dict | None:
    """Sama dengan `build_context`, tapi tanpa menunggu cutout: eksposur dipilih dari
    header saja (satu permintaan kecil per eksposur satu detektor), supaya latar
    viewer siap beberapa detik setelah pencarian, bukan setelah semua data terbaca.
    Aturan pilihnya sama: detektor pertama yang punya dua eksposur atau lebih, lalu
    eksposur yang targetnya paling jauh dari tepi detektor."""
    t0 = time.time()
    by_detector: dict[int, list[Exposure]] = {}
    for e in exposures:
        by_detector.setdefault(e.detector, []).append(e)

    def depth(exp: Exposure):
        header = None
        for _ in range(2):  # satu kali ulang: jaringan sedang ramai oleh unduhan utama
            try:
                header = Head(exp.url).header
                break
            except Exception:
                continue
        if header is None:
            return None
        x, y = WCS(header).world_to_pixel_values(ra, dec)
        x0, y0 = int(round(float(x))) - cutout_px // 2, int(round(float(y))) - cutout_px // 2
        if x0 + cutout_px <= 0 or y0 + cutout_px <= 0 or x0 >= DETECTOR_PX or y0 >= DETECTOR_PX:
            return None  # target di luar detektor ini
        cx, cy = x0 + cutout_px // 2, y0 + cutout_px // 2
        return (-min(cx, cy, DETECTOR_PX - cx, DETECTOR_PX - cy), float(header["MJD-AVG"]), exp)

    for detector in DETECTOR_ORDER:
        candidates = by_detector.get(detector, [])
        if len(candidates) < 2:
            continue
        with ThreadPoolExecutor(min(32, len(candidates))) as pool:
            found = [d for d in pool.map(depth, candidates) if d is not None]
        if len(found) >= 2:
            chosen = [d[2] for d in sorted(found, key=lambda d: d[:2])[:MAX_EXPOSURES]]
            return _render(detector, chosen, ra, dec, out, cache_root, log, t0)
    log("  konteks: tidak ada detektor dengan dua eksposur yang terbaca dari header")
    return None


def _render(
    detector: int, chosen: list[Exposure], ra: float, dec: float, out: Path, cache_root: Path, log, t0: float
) -> dict | None:
    n = _wide_px()
    cache = cache_root / f"context_{ra:.5f}_{dec:+.5f}_{n}px"
    cache.mkdir(parents=True, exist_ok=True)

    def load(exp: Exposure) -> dict | None:
        try:
            return _read_wide(exp, ra, dec, n, cache)
        except Exception as err:  # latar tidak boleh menggagalkan bundle
            log(f"  konteks: {exp.key} gagal ({type(err).__name__})")
            return None

    with ThreadPoolExecutor(len(chosen)) as pool:
        wide = [w for w in pool.map(load, chosen) if w is not None]
    if not wide:
        return None

    gra, gdec = fr.sky_grid(ra, dec, FOV_ARCSEC, SIZE_PX)
    layers = []
    for w in wide:
        wcs = WCS(fits.Header.fromstring(str(w["header"])))
        x, y = fr.coarse_map(wcs.world_to_pixel_values, gra, gdec)
        layers.append(fr._bilinear(_flatten(w["image"]), x - int(w["x0"]), y - int(w["y0"])))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        image = np.nanmedian(layers, axis=0)

    finite = image[np.isfinite(image)]
    if finite.size < image.size * 0.2:
        return None
    sigma = 1.4826 * float(np.median(np.abs(finite - np.median(finite))))
    knee = max(4 * sigma, 1e-4)
    vmax = max(float(np.percentile(finite, 99.9)), 60 * knee)

    # Inti bintang yang jenuh tidak punya nilai dan akan tampak sebagai lubang
    # hitam di tengah bintang terang. Piksel kosong yang bertetangga dengan
    # piksel terang diisi terang; piksel kosong di tempat lain tetap gelap.
    # Diulang supaya inti yang lebar terisi dari tepi ke tengah.
    h, w = image.shape
    for _ in range(12):
        padded = np.pad(image, 2, constant_values=np.nan)
        around = np.full(image.shape, -np.inf)
        for dy in range(5):
            for dx in range(5):
                around = np.fmax(around, padded[dy : dy + h, dx : dx + w])
        fill = np.isnan(image) & (around > 0.5 * vmax)
        if not fill.any():
            break
        image = np.where(fill, vmax, image)

    Image.fromarray(fr.stretch(np.nan_to_num(image, nan=0.0), knee, vmax), "L").save(out / "context.png", optimize=True)
    log(f"  konteks: {len(wide)} eksposur D{detector}, {time.time() - t0:.1f}s")
    return {
        "image": "context.png",
        "fov_arcsec": FOV_ARCSEC,
        "size_px": SIZE_PX,
        "band": f"D{detector}",
        "n_exposures": len(wide),
        "coverage": round(float(finite.size / image.size), 3),
    }
