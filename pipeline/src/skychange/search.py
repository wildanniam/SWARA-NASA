"""Cari eksposur SPHEREx yang menutupi satu posisi langit, lewat layanan SIA IRSA.

SIA dipakai (bukan TAP) karena jauh lebih cepat untuk pencarian posisi:
diukur 2026-11-13, SIA 3-13 detik, TAP `CONTAINS(POINT, s_region)` 203 detik.
"""

from __future__ import annotations

import csv
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
S3_HTTP = "https://{bucket}.s3.amazonaws.com/{key}"
IBE_PREFIX = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"
DEFAULT_COLLECTIONS = ("spherex_dr1", "spherex_qr3")


def _collections() -> tuple[str, ...]:
    """Koleksi SIA yang dicari. Bawaannya rilis yang ada saat ini; rilis baru cukup
    ditambahkan lewat SWARA_COLLECTIONS (dipisah koma), tanpa mengubah kode.
    Urutan = prioritas bila eksposur yang sama muncul di dua koleksi."""
    raw = os.environ.get("SWARA_COLLECTIONS", "")
    names = tuple(n.strip() for n in raw.split(",") if n.strip())
    return names or DEFAULT_COLLECTIONS


COLLECTIONS = _collections()


@dataclass(frozen=True)
class Exposure:
    obs_id: str
    detector: int
    mjd: float  # awal eksposur (t_min)
    collection: str
    url: str  # berkas FITS penuh di S3, dibaca sebagian lewat HTTP range

    @property
    def key(self) -> str:
        return f"{self.obs_id}_D{self.detector}"


def _file_url(row: dict) -> str:
    try:
        aws = json.loads(row.get("cloud_access") or "{}")["aws"]
        return S3_HTTP.format(bucket=aws["bucket_name"], key=aws["key"])
    except (KeyError, ValueError):
        return row["access_url"].replace(
            IBE_PREFIX, S3_HTTP.format(bucket="nasa-irsa-spherex", key="")
        )


def _query(collection: str, ra: float, dec: float, radius_deg: float) -> list[Exposure]:
    r = httpx.get(
        SIA_URL,
        params={
            "COLLECTION": collection,
            "POS": f"circle {ra} {dec} {radius_deg}",
            "RESPONSEFORMAT": "CSV",
        },
        timeout=120,
    )
    r.raise_for_status()
    if not r.text.startswith("s_ra"):
        raise RuntimeError(f"SIA {collection} membalas bukan CSV: {r.text[:200]}")
    out = []
    for row in csv.DictReader(io.StringIO(r.text)):
        if row["dataproduct_type"] != "image" or row["calib_level"] != "2":
            continue
        out.append(
            Exposure(
                obs_id=row["obs_id"],
                detector=int(row["energy_bandpassname"].rsplit("D", 1)[1]),
                mjd=float(row["t_min"]),
                collection=collection,
                url=_file_url(row),
            )
        )
    return out


def search(ra: float, dec: float, radius_deg: float = 0.005) -> list[Exposure]:
    """Semua eksposur level-2 yang tapaknya menyentuh lingkaran di (ra, dec)."""
    with ThreadPoolExecutor(len(COLLECTIONS)) as pool:
        results = list(pool.map(lambda c: _query(c, ra, dec, radius_deg), COLLECTIONS))
    seen: dict[str, Exposure] = {}
    for rows in results:
        for e in rows:
            seen.setdefault(e.key, e)
    return sorted(seen.values(), key=lambda e: (e.mjd, e.detector))
