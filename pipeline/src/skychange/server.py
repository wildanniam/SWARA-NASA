"""Layanan tipis di atas mesin: koordinat bebas -> bundle, dengan cache dan progres.

Tidak ada logika sains di sini. Layanan hanya menerima koordinat, menjalankan
`build()` di latar, melaporkan progresnya, dan menyajikan folder bundle dengan
bentuk yang sama seperti preset.

  POST /api/sky            {"query": "nama benda, atau RA dan Dec"} -> keadaan pekerjaan
  GET  /api/sky/{id}       keadaan pekerjaan
  GET  /api/bundles/{id}/  manifest.json, spectrum.json, frames/*.png

Selagi sebuah bundle dibuat, keadaan pekerjaan menyebut apa yang sudah siap:
`wise` dan `context` (rinciannya di /api/bundles/{id}/preview.json), dan `seen_um`,
panjang gelombang tiap eksposur yang sudah terbaca.

Kalau variabel lingkungan SWARA_API_KEY diisi, setiap permintaan harus membawa
kunci itu di header X-Swara-Key. Dipakai saat layanan terbuka ke internet dan
hanya boleh dipanggil lewat proxy situsnya.
"""

from __future__ import annotations

import hmac
import logging
import math
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

import astropy.units as u
import httpx
from astropy.coordinates import SkyCoord
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bundle import NoData, build
from .resolve import resolve

log = logging.getLogger("skychange.server")

# Berapa bundle dibuat bersamaan; sisanya menunggu giliran. Tiap bundle memakai
# sekitar seratus sambungan ke S3 dan beberapa ratus MB memori. Bisa diatur lewat
# variabel lingkungan untuk server yang lebih besar atau lebih kecil.
MAX_BUILDS = max(1, int(os.environ.get("SWARA_MAX_BUILDS", "2")))
MAX_WAITING = 20
_NUMBER = r"[+-]?(?:\d+\.?\d*|\.\d+)"
_PLAIN_PAIR = re.compile(rf"({_NUMBER})[\s,]+({_NUMBER})")
_COORDINATE_LIKE = re.compile(r"[\d\s+\-.:,hmsd]+", re.IGNORECASE)
_SKY_ID = re.compile(r"\d{3}\.\d{4}[ns]\d{2}\.\d{4}")


def parse_coordinates(text: str) -> tuple[float, float] | None:
    """(RA, Dec) dalam derajat kalau `text` adalah koordinat; None kalau bukan.

    Dua angka polos dibaca sebagai derajat ("269.4463 +4.7682"). Bentuk lain
    dibaca astropy: RA dalam jam kecuali ditulis dengan satuan derajat, Dec dalam
    derajat ("08h55m10.831s -7d14m42.53s", "08:55:10.8 -07:14:42", "05h 35m 17s -05° 23' 28\"").
    """
    s = text.strip().replace("−", "-")
    pair = _PLAIN_PAIR.fullmatch(s)
    if pair:
        return float(pair[1]), float(pair[2])
    s = s.replace("°", "d").replace("′", "m").replace("'", "m").replace("″", "s").replace('"', "s")
    if not _COORDINATE_LIKE.fullmatch(s) or not any(ch.isdigit() for ch in s):
        return None
    try:
        c = SkyCoord(s.replace(",", " "), unit=(u.hourangle, u.deg))
    except Exception:
        return None
    return float(c.ra.deg), float(c.dec.deg)


def sky_id(ra: float, dec: float) -> str:
    return f"{ra:08.4f}{'n' if dec >= 0 else 's'}{abs(dec):07.4f}"


@dataclass
class Job:
    id: str
    ra: float
    dec: float
    status: str = "queued"  # queued | running | ready | error
    stage: str = ""  # search | fetch | frames | context | wise
    done: int = 0
    total: int = 0
    error: str = ""  # no_data | failed
    # Yang sudah bisa ditampilkan selagi bundle dibuat (lihat preview.json di folder bundle).
    wise: bool = False
    context: bool = False
    # Panjang gelombang (mikron) yang diamati tiap eksposur yang sudah terbaca.
    seen_um: list[float] = field(default_factory=list)


class SkyRequest(BaseModel):
    query: str


def create_app(bundles: Path, cache: Path) -> FastAPI:
    bundles.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("SWARA_API_KEY", "")
    # Dengan kunci, dokumentasi otomatis ikut ditutup: layanan hanya untuk proxy situs.
    app = FastAPI(title="SWARA API", **({"docs_url": None, "redoc_url": None, "openapi_url": None} if key else {}))

    if key:

        @app.middleware("http")
        async def require_key(request: Request, call_next):
            if not hmac.compare_digest(request.headers.get("x-swara-key", ""), key):
                return JSONResponse({"detail": "Forbidden"}, status_code=403)
            return await call_next(request)

    jobs: dict[str, Job] = {}
    lock = threading.Lock()
    pool = ThreadPoolExecutor(MAX_BUILDS)

    def is_built(job_id: str) -> bool:
        return (bundles / job_id / "manifest.json").exists()

    def run(job: Job) -> None:
        job.status = "running"

        def progress(stage: str, done: int, total: int) -> None:
            job.stage, job.done, job.total = stage, done, total

        try:
            name = f"RA {job.ra:.4f} Dec {job.dec:+.4f}"
            build(
                job.id,
                name,
                job.ra,
                job.dec,
                bundles,
                cache,
                log=log.info,
                progress=progress,
                on_part=lambda kind: setattr(job, kind, True),
                on_wavelength=lambda um: job.seen_um.append(round(um, 3)),
            )
            job.status = "ready"
        except NoData:
            job.status, job.error = "error", "no_data"
        except Exception:
            log.exception("build %s gagal", job.id)
            job.status, job.error = "error", "failed"

    @app.post("/api/sky")
    def start(req: SkyRequest) -> dict:
        query = " ".join(req.query.split())
        if not query or len(query) > 80:
            raise HTTPException(422, "Type an object name, or RA and Dec.")
        # Koordinat dulu; kalau bukan koordinat, anggap nama benda.
        label, pm = None, None
        position = parse_coordinates(query)
        if position is None:
            try:
                found = resolve(query)
            except httpx.HTTPError:
                log.exception("Sesame gagal untuk %r", query)
                raise HTTPException(503, "The name lookup is not reachable right now. Try RA and Dec.") from None
            if found is None:
                raise HTTPException(
                    404, "SIMBAD has no object with this name, and it does not read as RA and Dec."
                )
            position, label, pm = (found.ra, found.dec), query, found.pm_arcsec_yr
        ra, dec = position
        if not (math.isfinite(ra) and math.isfinite(dec) and 0 <= ra <= 360 and -90 <= dec <= 90):
            raise HTTPException(422, "RA must be 0 to 360 degrees and Dec -90 to +90 degrees.")
        # 4 desimal = 0,36 detik busur: jauh di bawah satu piksel SPHEREx (6,15").
        ra, dec = round(ra, 4) % 360, round(dec, 4)
        job_id = sky_id(ra, dec)
        with lock:
            job = jobs.get(job_id)
            if job is None or job.status == "error":
                if is_built(job_id):
                    job = Job(job_id, ra, dec, status="ready")
                else:
                    waiting = sum(j.status == "queued" for j in jobs.values())
                    if waiting >= MAX_WAITING:
                        raise HTTPException(503, "Too many requests are waiting. Try again in a few minutes.")
                    job = Job(job_id, ra, dec)
                    pool.submit(run, job)
                jobs[job_id] = job
        # Nama dan gerak katalog milik permintaan ini, bukan milik bundelnya:
        # dua nama bisa menunjuk posisi yang sama.
        return {**asdict(job), "label": label, "pm_arcsec_yr": pm}

    @app.get("/api/sky/{job_id}")
    def status(job_id: str) -> dict:
        if not _SKY_ID.fullmatch(job_id):
            raise HTTPException(404, "Unknown sky position.")
        job = jobs.get(job_id)
        if job is None:
            if not is_built(job_id):
                raise HTTPException(404, "Unknown sky position.")
            sign = 1 if "n" in job_id else -1
            ra, dec = re.split("[ns]", job_id)
            job = Job(job_id, float(ra), sign * float(dec), status="ready")
        return asdict(job)

    app.mount("/api/bundles", StaticFiles(directory=bundles), name="bundles")
    return app
