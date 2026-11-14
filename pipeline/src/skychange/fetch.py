"""Ambil potongan kecil (cutout) dari tiap eksposur, langsung dari berkas di AWS.

Berkas level-2 penuh berukuran ~65 MB. Layanan cutout IRSA mengirim ~4 MB per
potongan (tabel PSF ikut) dan ~11 detik per berkas. Di sini hanya header dan
baris piksel yang dibutuhkan yang dibaca lewat HTTP range, lalu disimpan
sebagai .npz kecil supaya tidak perlu diunduh ulang. HDU VARIANCE sengaja
tidak dibaca: galat fluks dihitung dari sebaran latar di sekitar target.
"""

from __future__ import annotations

import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

from .search import Exposure

from astropy import log as _astropy_log

# WCS spektral (key 'W') memakai SIP tanpa akhiran -SIP; astropy mencetak
# catatan INFO panjang untuk tiap berkas. Koordinatnya tetap dihitung benar.
_astropy_log.setLevel("ERROR")
warnings.simplefilter("ignore", FITSFixedWarning)
warnings.filterwarnings("ignore", module="astropy.wcs")

FSSPEC = {"block_size": 64 * 1024, "cache_type": "bytes"}
DETECTOR_PX = 2040


@dataclass
class Cutout:
    exposure: Exposure
    image: np.ndarray  # MJy/sr, NaN di luar detektor
    flags: np.ndarray  # bitmask SPHEREx, lihat flags.py
    lam: np.ndarray  # panjang gelombang per piksel (mikron)
    bandwidth: np.ndarray  # lebar pita per piksel (mikron)
    x0: int  # posisi piksel [0,0] cutout di detektor penuh
    y0: int
    header: str  # header IMAGE asli (WCS detektor penuh)
    mjd: float  # titik tengah eksposur
    omega_sr: float  # sudut ruang satu piksel

    _wcs: WCS | None = None

    @property
    def wcs(self) -> WCS:
        if self._wcs is None:
            self._wcs = WCS(fits.Header.fromstring(self.header))
        return self._wcs

    def world_to_cutout(self, ra, dec):
        x, y = self.wcs.world_to_pixel_values(ra, dec)
        return np.asarray(x) - self.x0, np.asarray(y) - self.y0

    def cutout_to_world(self, x, y):
        return self.wcs.pixel_to_world_values(np.asarray(x) + self.x0, np.asarray(y) + self.y0)


def _padded_section(hdu, x0: int, y0: int, n: int, fill):
    """Baca n x n piksel mulai (x0, y0); bagian di luar detektor diisi `fill`."""
    out = np.full((n, n), fill, dtype=np.float32 if isinstance(fill, float) else np.int32)
    xa, xb = max(x0, 0), min(x0 + n, DETECTOR_PX)
    ya, yb = max(y0, 0), min(y0 + n, DETECTOR_PX)
    if xa < xb and ya < yb:
        out[ya - y0 : yb - y0, xa - x0 : xb - x0] = hdu.section[ya:yb, xa:xb]
    return out


def _read_remote(exp: Exposure, ra: float, dec: float, n: int) -> dict | None:
    with fits.open(exp.url, use_fsspec=True, fsspec_kwargs=FSSPEC) as hdul:
        header = hdul["IMAGE"].header
        x, y = WCS(header).world_to_pixel_values(ra, dec)
        x0, y0 = int(round(float(x))) - n // 2, int(round(float(y))) - n // 2
        if x0 + n <= 0 or y0 + n <= 0 or x0 >= DETECTOR_PX or y0 >= DETECTOR_PX:
            return None  # posisi jatuh di luar detektor ini
        yy, xx = np.mgrid[y0 : y0 + n, x0 : x0 + n]
        lam, bw = WCS(header, fobj=hdul, key="W").pixel_to_world_values(xx, yy)
        return {
            "image": _padded_section(hdul["IMAGE"], x0, y0, n, float("nan")),
            "flags": _padded_section(hdul["FLAGS"], x0, y0, n, 0),
            "lam": np.asarray(lam, dtype=np.float32),
            "bandwidth": np.asarray(bw, dtype=np.float32),
            "x0": x0,
            "y0": y0,
            "header": header.tostring(),
            "mjd": float(header["MJD-AVG"]),
            "omega_sr": float(header["OMEGA_MEDIAN"]) / 206264.806**2,
        }


def _load(exp: Exposure, ra: float, dec: float, n: int, cache: Path, retries: int = 3) -> Cutout | None:
    path = cache / f"{exp.key}.npz"
    miss = cache / f"{exp.key}.miss"
    if miss.exists():
        return None
    if not path.exists():
        for attempt in range(retries):
            try:
                data = _read_remote(exp, ra, dec, n)
                break
            except Exception:
                if attempt == retries - 1:
                    raise
                time.sleep(1.5 * (attempt + 1))
        if data is None:
            miss.touch()
            return None
        tmp = path.with_suffix(".tmp.npz")
        np.savez_compressed(tmp, **data)
        tmp.rename(path)
    with np.load(path) as z:
        d = {k: z[k] for k in z.files}
    return Cutout(
        exposure=exp,
        image=d["image"],
        flags=d["flags"],
        lam=d["lam"],
        bandwidth=d["bandwidth"],
        x0=int(d["x0"]),
        y0=int(d["y0"]),
        header=str(d["header"]),
        mjd=float(d["mjd"]),
        omega_sr=float(d["omega_sr"]),
    )


def cache_dir(root: Path, ra: float, dec: float, n: int) -> Path:
    d = root / f"{ra:.5f}_{dec:+.5f}_{n}px"
    d.mkdir(parents=True, exist_ok=True)
    return d


def fetch_all(
    exposures: list[Exposure],
    ra: float,
    dec: float,
    n: int,
    cache_root: Path,
    workers: int = 24,
    progress=None,
) -> tuple[list[Cutout], list[tuple[Exposure, str]]]:
    """Ambil semua cutout secara paralel. Mengembalikan (cutout, daftar gagal)."""
    cache = cache_dir(cache_root, ra, dec, n)
    done: list[Cutout] = []
    failed: list[tuple[Exposure, str]] = []
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(_load, e, ra, dec, n, cache): e for e in exposures}
        for i, fut in enumerate(as_completed(futures), 1):
            exp = futures[fut]
            try:
                c = fut.result()
                if c is not None:
                    done.append(c)
            except Exception as err:  # satu berkas gagal tidak menggagalkan target
                failed.append((exp, f"{type(err).__name__}: {err}"))
            if progress:
                progress(i, len(exposures))
    done.sort(key=lambda c: (c.mjd, c.exposure.detector))
    return done, failed
