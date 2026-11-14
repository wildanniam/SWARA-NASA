"""Nama benda -> koordinat, lewat CDS Sesame (SIMBAD).

SIMBAD memberi posisi pada epoch J2000. Benda yang bergerak cepat sudah pindah
ratusan detik busur sejak itu (Barnard's Star: 270"), jauh di luar medan 2 menit
busur. Jadi posisinya digeser dengan gerak diri katalog ke `EPOCH`, supaya benda
itu berada di tengah data SPHEREx. Cara yang sama dipakai untuk `presets.json`.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import quote

import httpx

SESAME_URL = "https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/S"
EPOCH = 2026.0  # tengah rentang data SPHEREx yang tersedia (2025-2026)


@dataclass(frozen=True)
class Resolved:
    ra: float  # derajat, sudah digeser ke EPOCH
    dec: float
    pm_arcsec_yr: float | None  # besar gerak diri katalog; None kalau SIMBAD tidak punya


def _number(node: ET.Element | None, tag: str) -> float | None:
    text = node.findtext(tag) if node is not None else None
    try:
        return float(text) if text else None
    except ValueError:
        return None


@lru_cache(maxsize=1024)
def resolve(name: str) -> Resolved | None:
    """Koordinat benda bernama `name`, atau None kalau SIMBAD tidak mengenalnya.
    Kegagalan jaringan dilempar sebagai galat httpx (tidak disimpan di cache)."""
    r = httpx.get(f"{SESAME_URL}?{quote(name)}", timeout=15, follow_redirects=True)
    r.raise_for_status()
    found = ET.fromstring(r.text).find(".//Resolver")
    ra, dec = _number(found, "jradeg"), _number(found, "jdedeg")
    if ra is None or dec is None:
        return None
    pm = found.find("pm") if found is not None else None
    pm_ra, pm_dec = _number(pm, "pmRA"), _number(pm, "pmDE")  # mas/tahun; pmRA sudah dikali cos(dec)
    if pm_ra is None or pm_dec is None:
        return Resolved(ra, dec, None)
    years = EPOCH - 2000.0
    return Resolved(
        ra=(ra + pm_ra / 3.6e6 * years / math.cos(math.radians(dec))) % 360,
        dec=dec + pm_dec / 3.6e6 * years,
        pm_arcsec_yr=math.hypot(pm_ra, pm_dec) / 1000,
    )
