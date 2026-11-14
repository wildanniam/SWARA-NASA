"""Layanan tipis di atas mesin: koordinat bebas -> bundle, dengan cache dan progres.

Tidak ada logika sains di sini. Layanan hanya menerima koordinat, menjalankan
`build()` di latar, melaporkan progresnya, dan menyajikan folder bundle dengan
bentuk yang sama seperti preset.

  POST /api/sky            {"ra": "...", "dec": "..."} -> keadaan pekerjaan
  GET  /api/sky/{id}       keadaan pekerjaan
  GET  /api/bundles/{id}/  manifest.json, spectrum.json, frames/*.png
"""

from __future__ import annotations

import logging
import math
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

import astropy.units as u
from astropy.coordinates import Angle
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bundle import NoData, build

log = logging.getLogger("skychange.server")

MAX_BUILDS = 2  # tiap build memakai 32 koneksi ke S3
MAX_WAITING = 20
_NUMBER = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)")
_SKY_ID = re.compile(r"\d{3}\.\d{4}[ns]\d{2}\.\d{4}")


def parse_angle(text: str | float, *, is_ra: bool) -> float:
    """Sudut dalam derajat dari teks pengguna.

    Angka polos dibaca sebagai derajat. Bentuk jam-menit-detik tanpa satuan
    ("08:55:10.8", "08 55 10.8") dibaca sebagai jam untuk RA dan derajat untuk Dec.
    """
    s = str(text).strip().replace("−", "-").replace("°", "d").replace("′", "m").replace("″", "s")
    if not s:
        raise ValueError("kosong")
    if _NUMBER.fullmatch(s):
        return float(s)
    has_hours, has_degrees = "h" in s.lower(), "d" in s.lower()
    if has_hours and not is_ra:
        raise ValueError("Dec tidak ditulis dalam jam")
    if has_hours or has_degrees:
        return float(Angle(s).deg)
    return float(Angle(s, unit=u.hourangle if is_ra else u.deg).deg)


def sky_id(ra: float, dec: float) -> str:
    return f"{ra:08.4f}{'n' if dec >= 0 else 's'}{abs(dec):07.4f}"


@dataclass
class Job:
    id: str
    ra: float
    dec: float
    status: str = "queued"  # queued | running | ready | error
    stage: str = ""  # search | fetch | frames
    done: int = 0
    total: int = 0
    error: str = ""  # no_data | failed


class SkyRequest(BaseModel):
    ra: str | float
    dec: str | float


def create_app(bundles: Path, cache: Path) -> FastAPI:
    bundles.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="Sky Change Explorer API")
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
            build(job.id, name, job.ra, job.dec, bundles, cache, log=log.info, progress=progress)
            job.status = "ready"
        except NoData:
            job.status, job.error = "error", "no_data"
        except Exception:
            log.exception("build %s gagal", job.id)
            job.status, job.error = "error", "failed"

    @app.post("/api/sky")
    def start(req: SkyRequest) -> dict:
        try:
            ra = parse_angle(req.ra, is_ra=True)
            dec = parse_angle(req.dec, is_ra=False)
        except Exception:
            raise HTTPException(422, "Could not read these coordinates.") from None
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
        return asdict(job)

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
