"""Bangun "bundle" untuk satu posisi langit: frame selaras + spektrum + manifest.

Isi folder bundle:
  manifest.json   target, jendela waktu, band, daftar frame, gerak terukur
  spectrum.json   titik spektrum per eksposur (kontrak untuk sonifikasi)
  frames/*.png    citra per (jendela, band) dan topeng piksel bermasalah
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from astropy.time import Time
from PIL import Image

from . import frames as fr
from .context import build_context
from .fetch import fetch_all
from .search import search
from .spectrum import measure
from .wise import build_wise

PIXEL_ARCSEC = 6.15
MAIN_WINDOW_MIN = 30  # jendela dengan eksposur lebih sedikit dianggap kunjungan kecil

# Medan 6 menit busur: cukup lebar untuk gerak 14 tahun di data WISE (Barnard's Star
# sekitar 2,4 menit busur), dan viewer memperbesar bagian tengahnya untuk SPHEREx.
FOV_ARCSEC = 360.0
FRAME_PX = 480


class NoData(RuntimeError):
    """Tidak ada eksposur SPHEREx yang bisa dipakai di posisi ini."""


def cutout_px(fov_arcsec: float) -> int:
    """Ukuran cutout (piksel detektor) yang menutup FOV pada orientasi apa pun."""
    n = math.ceil(fov_arcsec * math.sqrt(2) / PIXEL_ARCSEC) + 1
    return n if n % 2 else n + 1


def _date(mjd: float) -> str:
    return Time(mjd, format="mjd").iso[:10]


def _round(x: float, digits: int = 6) -> float:
    return float(f"{x:.{digits}g}")


def build(
    target_id: str,
    name: str,
    ra: float,
    dec: float,
    out_root: Path,
    cache_root: Path,
    fov_arcsec: float = FOV_ARCSEC,
    frame_px: int = FRAME_PX,
    workers: int = 32,
    log=print,
    progress=None,
) -> dict:
    """`progress(stage, done, total)` dipanggil saat tahap berganti dan tiap cutout
    selesai; tahap: "search", "fetch", "frames", "context", "wise"."""
    report = progress or (lambda stage, done, total: None)
    t0 = time.time()
    report("search", 0, 0)
    exposures = search(ra, dec)
    t_search = time.time() - t0
    log(f"[{target_id}] {len(exposures)} eksposur ditemukan ({t_search:.1f}s)")
    if not exposures:
        raise NoData("Tidak ada data SPHEREx di posisi ini")

    t1 = time.time()
    report("fetch", 0, len(exposures))
    cutouts, failed = fetch_all(
        exposures,
        ra,
        dec,
        cutout_px(fov_arcsec),
        cache_root,
        workers,
        progress=lambda done, total: report("fetch", done, total),
    )
    t_fetch = time.time() - t1
    log(f"[{target_id}] {len(cutouts)} cutout siap, {len(failed)} gagal ({t_fetch:.1f}s)")
    if not cutouts:
        if len(failed) == len(exposures):
            raise RuntimeError(f"Semua cutout gagal diambil: {failed[0][1]}")
        raise NoData("Posisi ini jatuh di luar semua detektor")
    report("frames", 0, 0)

    win_idx = fr.split_windows([c.mjd for c in cutouts])
    n_win = max(win_idx) + 1
    windows = []
    for w in range(n_win):
        mj = [c.mjd for c, i in zip(cutouts, win_idx) if i == w]
        windows.append(
            {
                "id": f"w{w + 1}",
                "date_start": _date(min(mj)),
                "date_end": _date(max(mj)),
                "mjd_mid": round(float(np.median(mj)), 4),
                "n_exposures": len(mj),
                "main": len(mj) >= MAIN_WINDOW_MIN,
            }
        )

    # --- spektrum ---
    points = []
    for c, w in zip(cutouts, win_idx):
        p = measure(c, ra, dec)
        # Piksel tanpa solusi panjang gelombang memberi NaN: titik itu tidak punya
        # tempat di spektrum, dan NaN bukan JSON yang sah untuk browser.
        if p is None or not (math.isfinite(p.lambda_um) and math.isfinite(p.flux_jy) and math.isfinite(p.flux_err_jy)):
            continue
        d = asdict(p)
        points.append(
            {
                "window": windows[w]["id"],
                "date": _date(p.mjd),
                "mjd": round(p.mjd, 5),
                "detector": p.detector,
                "lambda_um": round(p.lambda_um, 4),
                "bandwidth_um": round(p.bandwidth_um, 4),
                "flux_jy": _round(p.flux_jy, 5),
                "flux_err_jy": _round(p.flux_err_jy, 3),
                "snr": round(p.snr, 1),
                "detected": p.detected,
                "flag": p.flag,
                "flagged": p.flag != "ok",
                "missing_pixels": p.missing_pixels,
                "ra": round(d["ra"], 6),
                "dec": round(d["dec"], 6),
                "obs_id": p.obs_id,
            }
        )
    points.sort(key=lambda p: (p["window"], p["lambda_um"]))

    # --- gerak terukur: median centroid per jendela, relatif jendela utama pertama ---
    motion = []
    ref = None
    for w in windows:
        pts = [p for p in points if p["window"] == w["id"] and p["detected"]]
        if len(pts) < 5:
            continue
        mra = float(np.median([p["ra"] for p in pts]))
        mdec = float(np.median([p["dec"] for p in pts]))
        if ref is None and w["main"]:
            ref = (mra, mdec)
        if ref is None:
            continue
        dra = (mra - ref[0]) * 3600 * math.cos(math.radians(dec))
        ddec = (mdec - ref[1]) * 3600
        scatter = float(
            np.median(
                [
                    math.hypot(
                        (p["ra"] - mra) * 3600 * math.cos(math.radians(dec)),
                        (p["dec"] - mdec) * 3600,
                    )
                    for p in pts
                ]
            )
        )
        motion.append(
            {
                "window": w["id"],
                "ra": round(mra, 6),
                "dec": round(mdec, 6),
                "d_east_arcsec": round(dra, 2),
                "d_north_arcsec": round(ddec, 2),
                "scatter_arcsec": round(scatter, 2),
                "n": len(pts),
            }
        )

    # --- frame ---
    out = out_root / target_id
    (out / "frames").mkdir(parents=True, exist_ok=True)
    gra, gdec = fr.sky_grid(ra, dec, fov_arcsec, frame_px)
    stacks = {}
    for w in range(n_win):
        for band in fr.BANDS:
            sel = [c for c, i in zip(cutouts, win_idx) if i == w and c.exposure.detector == band["detector"]]
            if sel:
                stacks[(w, band["id"])] = (fr.stack(sel, gra, gdec), sel)

    frame_list = []
    for band in fr.BANDS:
        imgs = [s[0][0] for (w, b), s in stacks.items() if b == band["id"]]
        if not imgs:
            continue
        finite = np.concatenate([i[np.isfinite(i)] for i in imgs])
        if not finite.size:
            continue
        sigma = 1.4826 * float(np.median(np.abs(finite - np.median(finite))))
        knee = max(3 * sigma, 1e-4)
        vmax = max(float(np.percentile(finite, 99.9)), 20 * knee)
        for (w, b), ((image, sat, bad), sel) in sorted(stacks.items()):
            if b != band["id"]:
                continue
            stem = f"{windows[w]['id']}_{b}"
            Image.fromarray(fr.stretch(image, knee, vmax), "L").save(out / "frames" / f"{stem}.png", optimize=True)
            mask = np.zeros(image.shape, dtype=np.uint8)
            mask[bad > 0.5] = 128
            mask[sat > 0.5] = 255
            Image.fromarray(mask, "L").save(out / "frames" / f"{stem}_mask.png", optimize=True)
            frame_list.append(
                {
                    "window": windows[w]["id"],
                    "band": b,
                    "image": f"frames/{stem}.png",
                    "mask": f"frames/{stem}_mask.png",
                    "n_exposures": len(sel),
                    "knee_mjy_sr": _round(knee, 4),
                    "vmax_mjy_sr": _round(vmax, 4),
                    "saturated_fraction": round(float((sat > 0.5).mean()), 4),
                    "bad_fraction": round(float((bad > 0.5).mean()), 4),
                }
            )

    # Citra medan lebar untuk latar viewer. Tambahan saja: kalau gagal, bundle tetap jadi.
    report("context", 0, 0)
    try:
        context = build_context(cutouts, ra, dec, out, cache_root, log=log)
    except Exception as err:
        log(f"[{target_id}] konteks gagal: {type(err).__name__}: {err}")
        context = None

    # Riwayat WISE 2010-2024 di medan yang sama. Juga tambahan saja.
    report("wise", 0, 0)
    try:
        wise = build_wise(ra, dec, out, fov_arcsec, log=log)
    except Exception as err:
        log(f"[{target_id}] WISE gagal: {type(err).__name__}: {err}")
        wise = None

    manifest = {
        "id": target_id,
        "name": name,
        "ra": ra,
        "dec": dec,
        "fov_arcsec": fov_arcsec,
        "frame_px": frame_px,
        "native_pixel_arcsec": PIXEL_ARCSEC,
        "orientation": "north up, east left",
        "stretch": "asinh(v/knee)/asinh(vmax/knee) on background-subtracted MJy/sr; knee = 3x sky noise; "
        "same knee and vmax for all windows of a band",
        "mask_values": {"0": "ok", "128": "bad or missing in most exposures", "255": "saturated in most exposures"},
        "windows": windows,
        "bands": fr.BANDS,
        "frames": frame_list,
        "motion": motion,
        "context": context,
        "wise": wise,
        "spectrum": "spectrum.json",
        "source": {
            "mission": "SPHEREx",
            "archive": "NASA/IPAC Infrared Science Archive (IRSA)",
            "collections": sorted({c.exposure.collection for c in cutouts}),
            "n_exposures_found": len(exposures),
            "n_exposures_used": len(cutouts),
            "n_failed": len(failed),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    }
    spectrum = {
        "id": target_id,
        "name": name,
        "units": {"lambda_um": "micron", "flux_jy": "jansky", "flux_err_jy": "jansky"},
        "method": "5x5 px box aperture on background-subtracted level-2 image; background and noise "
        "from 5-10 px annulus; no aperture correction, neighbours not deblended",
        "flag_values": {
            "ok": "no problem flagged",
            "saturated": "SPHEREx flags overflow inside the aperture but every pixel has a value; "
            "flux accuracy not verified",
            "saturated_core": "source too bright: core pixels have no value, flux is not usable",
            "bad_pixel": "detector artefact or missing pixel inside aperture",
        },
        "windows": [{k: w[k] for k in ("id", "date_start", "date_end", "n_exposures", "main")} for w in windows],
        "points": points,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, allow_nan=False))
    (out / "spectrum.json").write_text(json.dumps(spectrum, indent=1, allow_nan=False))

    timing = {"search_s": round(t_search, 1), "fetch_s": round(t_fetch, 1), "total_s": round(time.time() - t0, 1)}
    log(f"[{target_id}] bundle ditulis ke {out} ({timing['total_s']}s total)")
    return {"manifest": manifest, "spectrum": spectrum, "failed": failed, "timing": timing}
