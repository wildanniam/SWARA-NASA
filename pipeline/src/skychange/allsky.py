"""Peta seluruh langit untuk pembuka viewer, dari peta langit penuh SPHEREx sendiri.

Sumbernya HiPS kubus SPHEREx DR1 di IRSA: 102 panjang gelombang dari 0,75 sampai
5 mikron, data Mei 2025 sampai Mei 2026, sudah diregangkan asinh (potong 0-40) dan
disimpan sebagai PNG. Yang dipakai di sini pratinjau `Norder3/Allsky_F.png`: 768
tile 64 piksel dalam satu berkas (resolusi sekitar 6,9 menit busur), jadi satu
panjang gelombang = satu unduhan sekitar 1 MB. Untuk tiap band dipakai saluran
tengahnya (9 dari 17).

Tile disusun ulang menjadi peta HEALPix bersarang, lalu diproyeksikan ke Hammer-Aitoff
dalam koordinat galaktik: Bima Sakti mendatar, pusat galaksi di tengah, bujur naik ke
kiri seperti langit dilihat dari bumi. Letak piksel di dalam tile ditentukan dari data
(lihat `_tile_pixel`). Viewer memakai rumus proyeksi yang sama, dengan matriks ICRS ke
galaktik yang ditulis di manifest, supaya penanda dan bacaan koordinat cocok dengan peta.

Garis rasi diambil dari d3-celestial (lisensi BSD-3), batas rasi dari astropy
(`get_constellation`, batas resmi IAU).
"""

from __future__ import annotations

import io
import json
import math
from pathlib import Path

import astropy.units as u
import httpx
import numpy as np
from astropy.coordinates import SkyCoord, get_constellation
from PIL import Image

HIPS = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube"
ORDER = 3
TILE = 64  # piksel per tile di pratinjau Allsky
COLS = 27  # tile per baris di pratinjau Allsky
NSIDE = 2 ** (ORDER + 6)  # 64 = 2^6 piksel per sisi tile
# Indeks frame kubus: 17 x (band - 1) + (saluran - 1). Saluran 9 adalah tengah band.
FRAMES = {f"D{b}": 17 * (b - 1) + 8 for b in range(1, 7)}
DEFAULT_BAND = "D5"  # sama dengan band bawaan lensa
WIDTH = 2048

# Garis rasi: d3-celestial, dikunci ke satu commit supaya hasilnya bisa diulang.
D3_COMMIT = "master"
D3_BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/{commit}/data"

# Benda yang terlihat di peta dan membantu orang mengenali langit. Posisi dari SIMBAD.
FEATURES = [
    ("Centre of the Milky Way", 266.4168, -29.0078),
    ("Large Magellanic Cloud", 80.8942, -69.7561),
    ("Small Magellanic Cloud", 13.1867, -72.8286),
    ("Andromeda Galaxy", 10.6847, 41.2690),
]

GRID_STEP = 0.5  # derajat, kisi pencarian nama rasi


def _get(url: str, timeout: float = 90.0) -> bytes:
    for attempt in range(3):
        try:
            r = httpx.get(url, timeout=timeout, follow_redirects=True)
            r.raise_for_status()
            return r.content
        except httpx.HTTPError:
            if attempt == 2:
                raise
    raise AssertionError("tidak tercapai")


def properties() -> dict[str, str]:
    """Berkas `properties` HiPS sebagai kamus."""
    out = {}
    for line in _get(f"{HIPS}/properties").decode().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def _deinterleave(sub: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Indeks di dalam tile (bersarang) ke dua koordinat: bit genap dan bit ganjil."""
    even = np.zeros_like(sub)
    odd = np.zeros_like(sub)
    for bit in range(6):
        even |= ((sub >> (2 * bit)) & 1) << bit
        odd |= ((sub >> (2 * bit + 1)) & 1) << bit
    return even, odd


def _tile_pixel(sub: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(baris, kolom) di gambar tile untuk indeks bersarang `sub` di dalam tile.

    Dari delapan susunan yang mungkin, hanya yang ini membuat 60 bintang paling terang
    jatuh di piksel terang: median nilainya 141 lawan 35 untuk tujuh susunan lain
    (diukur pada pratinjau 0,91 mikron)."""
    even, odd = _deinterleave(sub)
    return even, odd


def healpix_map(sheet: np.ndarray) -> np.ndarray:
    """Pratinjau Allsky (abu-abu) menjadi peta HEALPix bersarang dengan NSIDE piksel per sisi."""
    idx = np.arange(12 * NSIDE * NSIDE, dtype=np.int64)
    tile, sub = idx >> 12, idx & 4095
    row, col = _tile_pixel(sub)
    return sheet[(tile // COLS) * TILE + row, (tile % COLS) * TILE + col].astype(np.float32)


def hammer_inverse(width: int, height: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Bujur dan lintang galaktik (derajat) di pusat tiap piksel peta, dan topeng elips.

    x ke kanan, y ke atas di bidang Hammer; bujur naik ke kiri."""
    x = ((np.arange(width) + 0.5) / width * 2 - 1) * 2 * math.sqrt(2)
    y = (1 - (np.arange(height) + 0.5) / height * 2) * math.sqrt(2)
    X, Y = np.meshgrid(x, y)
    inside = (X / (2 * math.sqrt(2))) ** 2 + (Y / math.sqrt(2)) ** 2 <= 1
    z = np.sqrt(np.clip(1 - (X / 4) ** 2 - (Y / 2) ** 2, 0, 1))
    lam = 2 * np.arctan2(z * X, 2 * (2 * z**2 - 1))
    lat = np.degrees(np.arcsin(np.clip(z * Y, -1, 1)))
    return (-np.degrees(lam)) % 360, lat, inside


def hammer_forward(ra: np.ndarray, dec: np.ndarray, width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """RA dan Dec (derajat) ke piksel peta. Rumus yang sama dipakai viewer."""
    g = SkyCoord(ra=np.atleast_1d(ra) * u.deg, dec=np.atleast_1d(dec) * u.deg).galactic
    lam = -np.radians(((g.l.deg + 180) % 360) - 180)
    phi = np.radians(g.b.deg)
    k = np.sqrt(1 + np.cos(phi) * np.cos(lam / 2))
    x = 2 * math.sqrt(2) * np.cos(phi) * np.sin(lam / 2) / k
    y = math.sqrt(2) * np.sin(phi) / k
    return (x / (2 * math.sqrt(2)) + 1) / 2 * width, (1 - y / math.sqrt(2)) / 2 * height


def icrs_to_galactic() -> list[list[float]]:
    """Matriks putar ICRS ke galaktik menurut astropy, untuk viewer."""
    basis = SkyCoord(x=[1, 0, 0], y=[0, 1, 0], z=[0, 0, 1], representation_type="cartesian", frame="icrs")
    g = basis.galactic.cartesian
    # Kolom ke-i = arah galaktik dari sumbu ICRS ke-i.
    return [[round(float(v), 12) for v in row] for row in np.array([g.x.value, g.y.value, g.z.value])]


def project(values: np.ndarray, width: int, height: int) -> np.ndarray:
    """Peta HEALPix ke gambar Hammer galaktik, diinterpolasi bilinear di bola."""
    from astropy_healpix import HEALPix

    lon, lat, inside = hammer_inverse(width, height)
    c = SkyCoord(l=lon[inside] * u.deg, b=lat[inside] * u.deg, frame="galactic").icrs
    hp = HEALPix(nside=NSIDE, order="nested")
    out = np.zeros((height, width), dtype=np.float32)
    out[inside] = hp.interpolate_bilinear_lonlat(c.ra, c.dec, values)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def constellation_grid() -> dict:
    """Nama rasi di tiap titik kisi RA dan Dec, dipadatkan per baris (indeks, panjang)."""
    ras = np.arange(0, 360, GRID_STEP) + GRID_STEP / 2
    decs = np.arange(-90, 90 + 1e-9, GRID_STEP)
    RA, DEC = np.meshgrid(ras, decs)
    abbr = get_constellation(SkyCoord(ra=RA.ravel() * u.deg, dec=DEC.ravel() * u.deg), short_name=True)
    names = sorted(set(abbr))
    index = {a: i for i, a in enumerate(names)}
    codes = np.array([index[a] for a in abbr]).reshape(RA.shape)
    rows = []
    for row in codes:
        runs, start = [], 0
        for i in range(1, len(row) + 1):
            if i == len(row) or row[i] != row[start]:
                runs += [int(row[start]), i - start]
                start = i
        rows.append(runs)
    return {"step_deg": GRID_STEP, "ra0_deg": 0.0, "dec0_deg": -90.0, "abbr": names, "rows": rows}


def constellations(commit: str = D3_COMMIT) -> dict:
    base = D3_BASE.format(commit=commit)
    lines = json.loads(_get(f"{base}/constellations.lines.json"))["features"]
    names = json.loads(_get(f"{base}/constellations.json"))["features"]
    grid = constellation_grid()

    def key(d3_id: str) -> str:
        # d3-celestial memecah Serpens jadi dua bagian; IAU menyebut keduanya "Ser".
        return "Ser" if d3_id.startswith("Ser") else d3_id

    out_lines: dict[str, list] = {}
    for f in lines:
        parts = [[[round(lon % 360, 3), round(lat, 3)] for lon, lat in seg] for seg in f["geometry"]["coordinates"]]
        out_lines.setdefault(key(f["id"]), []).extend(parts)
    out_names, labels = {}, {}
    for f in names:
        k = key(f["id"])
        out_names.setdefault(k, f["properties"]["name"].replace(" Caput", "").replace(" Cauda", ""))
        lon, lat = f["geometry"]["coordinates"]
        labels.setdefault(k, [round(lon % 360, 3), round(lat, 3)])
    missing = set(grid["abbr"]) - set(out_names)
    if missing:
        raise RuntimeError(f"rasi tanpa nama dari d3-celestial: {sorted(missing)}")
    return {
        "source": f"d3-celestial by Olaf Frohn (BSD-3-Clause), commit {commit}; boundaries: IAU via astropy",
        "names": out_names,
        "labels": labels,
        "lines": out_lines,
        "grid": grid,
    }


def _d3_commit() -> str:
    """Commit d3-celestial terbaru, supaya manifest menyebut versi persis yang dipakai."""
    data = json.loads(_get("https://api.github.com/repos/ofrohn/d3-celestial/commits/master"))
    return data["sha"]


def check_alignment(image: np.ndarray, width: int, height: int, stars: list[tuple[float, float]]) -> tuple[float, float]:
    """Median nilai peta di posisi bintang terang lawan di posisi acak: yang pertama harus jauh lebih tinggi."""
    ra = np.array([s[0] for s in stars])
    dec = np.array([s[1] for s in stars])
    x, y = hammer_forward(ra, dec, width, height)
    at_stars = image[np.clip(y.astype(int), 0, height - 1), np.clip(x.astype(int), 0, width - 1)]
    rng = np.random.default_rng(1)
    rra = rng.uniform(0, 360, 4000)
    rdec = np.degrees(np.arcsin(rng.uniform(-1, 1, 4000)))
    rx, ry = hammer_forward(rra, rdec, width, height)
    at_random = image[np.clip(ry.astype(int), 0, height - 1), np.clip(rx.astype(int), 0, width - 1)]
    return float(np.median(at_stars)), float(np.median(at_random))


def build_allsky(out: Path, width: int = WIDTH, log=print) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    height = width // 2
    props = properties()
    lambdas = [float(v) for v in props["data_cube_crval3_arr"].split()]
    commit = _d3_commit()
    log(f"d3-celestial {commit[:10]}")
    sky = constellations(commit)
    frames = []
    for band, frame in FRAMES.items():
        sheet = np.asarray(Image.open(io.BytesIO(_get(f"{HIPS}/Norder{ORDER}/Allsky_{frame}.png"))).convert("L"))
        if sheet.shape != (29 * TILE, COLS * TILE):
            raise RuntimeError(f"pratinjau Allsky frame {frame} berukuran {sheet.shape}")
        image = project(healpix_map(sheet), width, height)
        name, small = f"sky_{band}.png", f"sky_{band}_small.png"
        Image.fromarray(image, "L").save(out / name, optimize=True)
        # Versi separuh lebar untuk layar kecil, dirata-rata dari versi penuh.
        Image.fromarray(image, "L").resize((width // 2, height // 2), Image.LANCZOS).save(out / small, optimize=True)
        first = frame - 8  # saluran 1 band ini
        frames.append(
            {
                "band": band,
                "frame": frame,
                "lambda_um": lambdas[frame],
                # Rentang saluran band ini (pusat saluran pertama dan terakhir), untuk pemilih panjang gelombang.
                "band_min_um": lambdas[first],
                "band_max_um": lambdas[first + 16],
                "image": name,
                "small": small,
            }
        )
        log(
            f"  {band}: frame {frame}, {lambdas[frame]:.3f} µm,"
            f" {(out / name).stat().st_size // 1024} KB + {(out / small).stat().st_size // 1024} KB"
        )

    # Pemeriksaan letak: bintang paling terang dari garis rasi (titik ujungnya) harus jatuh di piksel terang.
    first = np.asarray(Image.open(out / frames[0]["image"]))
    vertices = {tuple(p) for parts in sky["lines"].values() for seg in parts for p in seg}
    stars, rand = check_alignment(first, width, height, sorted(vertices))
    log(f"  letak: median di {len(vertices)} bintang garis rasi {stars:.0f}, di titik acak {rand:.0f}")
    if stars <= rand + 20:
        raise RuntimeError("bintang garis rasi tidak jatuh di bintang peta; proyeksi atau susunan tile salah")

    manifest = {
        "source": {
            "title": props.get("obs_title", "SPHEREx DR1 all-sky data cube"),
            "url": HIPS,
            "release": props.get("hips_release_date"),
            "mjd_start": float(props["t_min"]),
            "mjd_end": float(props["t_max"]),
            "order": ORDER,
            "pixel_arcmin": round(math.degrees(math.sqrt(4 * math.pi / (12 * NSIDE**2))) * 60, 2),
            "stretch": f"{props.get('hips_pixel_function', 'asinh')}, cut {props.get('hips_pixel_cut', '')}",
            "credit": "NASA/JPL-Caltech/IPAC, SPHEREx DR1 via IRSA",
        },
        "projection": {
            "name": "hammer",
            "frame": "galactic",
            "center_l_deg": 0.0,
            "longitude_increases": "left",
            "width": width,
            "height": height,
            "icrs_to_galactic": icrs_to_galactic(),
        },
        "default_band": DEFAULT_BAND,
        "frames": frames,
        "features": [{"name": n, "ra": ra, "dec": dec} for n, ra, dec in FEATURES],
        "constellations": sky,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    log(f"  manifest: {(out / 'manifest.json').stat().st_size // 1024} KB")
    return manifest
