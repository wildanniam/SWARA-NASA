"""Fotometri apertur per eksposur: satu eksposur = satu titik spektrum.

SPHEREx memakai filter variabel linier, jadi tiap eksposur melihat target di
panjang gelombang berbeda. Titik-titik dari satu jendela waktu membentuk
spektrum 0,75-5 mikron.

Ini fluks apertur sederhana (kotak 5x5 piksel, latar dari cincin di sekitarnya),
tanpa koreksi apertur dan tanpa pemisahan dari bintang tetangga. Cukup untuk
bentuk spektrum dan sonifikasi, bukan fotometri kelas publikasi.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import flags as F
from .fetch import Cutout

SEARCH_RADIUS_PX = 3.0  # ~18": menampung gerak diri bintang cepat selama misi
BOX_HALF = 2  # apertur kotak 5x5 piksel (~31")
ANNULUS_PX = (5.0, 10.0)
DETECT_SNR = 5.0


@dataclass
class Point:
    obs_id: str
    detector: int
    mjd: float
    lambda_um: float
    bandwidth_um: float
    flux_jy: float
    flux_err_jy: float
    snr: float
    detected: bool  # puncak jelas ditemukan; kalau tidak, fluks diukur di posisi nominal
    flag: str  # "ok" | "saturated" | "saturated_core" | "bad_pixel"
    missing_pixels: int  # piksel tanpa nilai di dalam apertur
    ra: float  # posisi terukur (centroid) atau nominal bila tidak terdeteksi
    dec: float


def measure(c: Cutout, ra: float, dec: float) -> Point | None:
    im = c.image.astype(float)
    n = im.shape[0]
    xt, yt = (float(v) for v in c.world_to_cutout(ra, dec))
    yy, xx = np.mgrid[:n, :n]
    r = np.hypot(xx - xt, yy - yt)

    ring = (r >= ANNULUS_PX[0]) & (r <= ANNULUS_PX[1]) & np.isfinite(im)
    if ring.sum() < 20:
        return None  # target terlalu dekat tepi detektor
    bg = float(np.median(im[ring]))
    sigma = float(1.4826 * np.median(np.abs(im[ring] - bg)))
    if not np.isfinite(sigma) or sigma <= 0:
        return None
    sub = im - bg

    # Cari puncak di dekat posisi nominal; kalau tidak ada yang jelas, ukur di posisi nominal.
    near = (r <= SEARCH_RADIUS_PX) & np.isfinite(sub)
    if not near.any():
        return None
    iy, ix = np.unravel_index(np.argmax(np.where(near, sub, -np.inf)), sub.shape)
    detected = bool(sub[iy, ix] > DETECT_SNR * sigma)
    if not detected:
        ix, iy = int(round(xt)), int(round(yt))
    if not (BOX_HALF <= ix < n - BOX_HALF and BOX_HALF <= iy < n - BOX_HALF):
        return None
    box = (slice(iy - BOX_HALF, iy + BOX_HALF + 1), slice(ix - BOX_HALF, ix + BOX_HALF + 1))
    stamp = sub[box]
    npix = int(np.isfinite(stamp).sum())
    if npix == 0:
        return None

    flux = float(np.nansum(stamp)) * c.omega_sr * 1e6  # MJy/sr * sr -> Jy
    err = sigma * np.sqrt(npix) * c.omega_sr * 1e6

    fl = c.flags[box]
    missing = int(stamp.size - npix)
    if (fl & F.SATURATED).any():
        # Inti tanpa nilai = fluks hilang. Kalau semua piksel terisi, nilainya
        # masih terukur walau SPHEREx menandai overflow.
        flag = "saturated_core" if missing else "saturated"
    elif missing or (fl & F.BAD).any():
        flag = "bad_pixel"
    else:
        flag = "ok"

    if detected:
        w = np.clip(np.nan_to_num(stamp), 0, None)
        cx = float((w * xx[box]).sum() / w.sum())
        cy = float((w * yy[box]).sum() / w.sum())
        pra, pdec = (float(v) for v in c.cutout_to_world(cx, cy))
    else:
        pra, pdec = ra, dec

    return Point(
        obs_id=c.exposure.obs_id,
        detector=c.exposure.detector,
        mjd=c.mjd,
        lambda_um=float(c.lam[iy, ix]),
        bandwidth_um=float(c.bandwidth[iy, ix]),
        flux_jy=flux,
        flux_err_jy=float(err),
        snr=float(flux / err) if err > 0 else 0.0,
        detected=detected,
        flag=flag,
        missing_pixels=missing,
        ra=pra,
        dec=pdec,
    )
