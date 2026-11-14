"""Susun cutout menjadi frame yang selaras: grid langit yang sama untuk semua waktu.

Tiap eksposur punya orientasi dan posisi piksel berbeda. Supaya bisa di-blink,
semuanya dipetakan ke grid langit tetap (utara di atas, timur di kiri) yang
berpusat di koordinat target. Benda diam tetap di tempat; benda bergerak pindah.
"""

from __future__ import annotations

import warnings

import numpy as np

from . import flags as F
from .fetch import Cutout

# Enam detektor SPHEREx dipakai sebagai "band" tampilan.
BANDS = [
    {"id": "D1", "detector": 1, "lambda_min": 0.75, "lambda_max": 1.10},
    {"id": "D2", "detector": 2, "lambda_min": 1.10, "lambda_max": 1.63},
    {"id": "D3", "detector": 3, "lambda_min": 1.63, "lambda_max": 2.42},
    {"id": "D4", "detector": 4, "lambda_min": 2.42, "lambda_max": 3.82},
    {"id": "D5", "detector": 5, "lambda_min": 3.82, "lambda_max": 4.42},
    {"id": "D6", "detector": 6, "lambda_min": 4.42, "lambda_max": 5.00},
]
WINDOW_GAP_DAYS = 30.0


def split_windows(mjds: list[float]) -> list[int]:
    """Indeks jendela waktu per eksposur; jeda > 30 hari memulai jendela baru."""
    order = np.argsort(mjds)
    out = np.zeros(len(mjds), dtype=int)
    w = 0
    for a, b in zip(order[:-1], order[1:]):
        if mjds[b] - mjds[a] > WINDOW_GAP_DAYS:
            w += 1
        out[b] = w
    return out.tolist()


def sky_grid(ra0: float, dec0: float, fov_arcsec: float, size_px: int):
    """RA/Dec tiap piksel keluaran. Baris 0 = utara, kolom 0 = timur."""
    step = fov_arcsec / size_px
    off = (np.arange(size_px) + 0.5) * step - fov_arcsec / 2
    east, north = np.meshgrid(-off, -off)
    dec = dec0 + north / 3600
    ra = ra0 + east / 3600 / np.cos(np.radians(dec0))
    return ra, dec


def _bilinear(im: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w = im.shape
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    v = (
        im[y0c, x0c] * (1 - fx) * (1 - fy)
        + im[y0c, x0c + 1] * fx * (1 - fy)
        + im[y0c + 1, x0c] * (1 - fx) * fy
        + im[y0c + 1, x0c + 1] * fx * fy
    )
    return np.where(ok, v, np.nan)


def _nearest(im: np.ndarray, x: np.ndarray, y: np.ndarray, fill) -> np.ndarray:
    h, w = im.shape
    xi, yi = np.rint(x).astype(int), np.rint(y).astype(int)
    ok = (xi >= 0) & (yi >= 0) & (xi < w) & (yi < h)
    return np.where(ok, im[np.clip(yi, 0, h - 1), np.clip(xi, 0, w - 1)], fill)


def stack(cutouts: list[Cutout], ra: np.ndarray, dec: np.ndarray):
    """Median beberapa eksposur di grid langit.

    Mengembalikan (citra MJy/sr dengan latar dikurangi, fraksi eksposur yang
    jenuh per piksel, fraksi eksposur yang rusak/hilang per piksel).
    """
    layers, sat, bad, lost = [], [], [], []
    for c in cutouts:
        x, y = c.world_to_cutout(ra, dec)
        im = c.image.astype(float)
        layer = _bilinear(im - np.nanmedian(im), x, y)
        fl = _nearest(c.flags, x, y, 0)
        saturated = (fl & F.SATURATED) != 0
        layers.append(layer)
        sat.append(saturated)
        bad.append(((fl & F.BAD) != 0) | ~np.isfinite(layer))
        lost.append(saturated & ~np.isfinite(layer))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # piksel tanpa data di semua eksposur -> NaN
        image = np.nanmedian(np.array(layers), axis=0)
    # Inti bintang yang jenuh tidak punya nilai. Ditandai +inf supaya tampil putih
    # penuh (lebih terang dari yang bisa diukur), bukan lubang hitam.
    image = np.where(np.mean(lost, axis=0) > 0.5, np.inf, image)
    return image, np.mean(sat, axis=0), np.mean(bad, axis=0)


def stretch(image: np.ndarray, knee: float, vmax: float) -> np.ndarray:
    """asinh ke 0-255: linier di bawah `knee` (beberapa kali derau latar, supaya
    bintang redup terlihat), terkompresi sampai `vmax` (supaya bintang terang
    tidak menutupi). knee dan vmax sama untuk semua jendela satu band, jadi
    perubahan terang antar waktu tidak hilang karena normalisasi."""
    v = np.clip(np.nan_to_num(image, nan=0.0, posinf=vmax), 0, None)
    out = np.arcsinh(v / knee) / np.arcsinh(vmax / knee)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)
