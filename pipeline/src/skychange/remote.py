"""Baca bagian berkas level-2 SPHEREx langsung dengan beberapa permintaan HTTP range.

Lewat astropy dan fsspec, satu eksposur butuh sekitar 360 permintaan kecil berurutan
dan 10,7 MB, hampir semuanya untuk HDU FLAGS: ia disimpan terkompresi per baris, dan
pembacaannya mengambil 64 KB untuk tiap baris. Server data ada di us-east-1, jadi
tiap permintaan dari sini menempuh sekitar seperempat detik.

Susunan berkasnya tetap, jadi yang dibutuhkan bisa diminta tepat sasaran:

  1. header PRIMARY dan IMAGE (awal berkas);
  2. baris-baris IMAGE yang memuat potongan (float32 tanpa kompresi, satu rentang);
  3. header FLAGS dan tabel penunjuknya, lalu hanya baris terkompresi yang dibutuhkan;
  4. tabel panjang gelombang WCS-WAVE (dua blok terakhir berkas).

Kalau susunan sebuah berkas ternyata berbeda, `Layout` dilempar dan pemanggil kembali
ke cara lama, yang lambat tapi tidak bergantung pada susunan.
"""

from __future__ import annotations

import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import numpy as np
from astropy.io import fits

BLOCK = 2880
HEAD_BYTES = 14 * BLOCK  # header PRIMARY (1 blok) dan IMAGE (8 blok), dengan cadangan
FLAGS_HEAD_BYTES = 16 * BLOCK  # header FLAGS (6 blok) dan tabel penunjuk 2040 x 8 byte
TAIL_BYTES = 2 * BLOCK  # HDU WCS-WAVE: satu blok header, satu blok data
DETECTOR_PX = 2040
# Rentang besar (citra medan lebar: ratusan baris, beberapa MB) dipecah dan diminta
# serentak. Satu sambungan lintas samudra lama mencapai kecepatan penuhnya.
SPLIT_ROWS = 96
_SPLIT = ThreadPoolExecutor(32, thread_name_prefix="split")


class Layout(Exception):
    """Berkas tidak tersusun seperti yang diandaikan pembaca cepat."""


_client: httpx.Client | None = None
_lock = threading.Lock()


def client() -> httpx.Client:
    """Satu klien untuk semua utas: sambungan dipakai ulang, tanpa jabat tangan TLS
    baru untuk tiap berkas."""
    global _client
    with _lock:
        if _client is None:
            _client = httpx.Client(
                timeout=httpx.Timeout(40.0, connect=15.0),
                limits=httpx.Limits(max_connections=256, max_keepalive_connections=256, keepalive_expiry=30.0),
            )
        return _client


def _get(url: str, byte_range: str) -> httpx.Response:
    """Satu permintaan range, diulang kalau sambungannya putus di tengah jalan.
    Server kadang menutup sambungan lama yang sedang dipakai ulang; permintaan baca
    aman diulang."""
    for attempt in range(3):
        try:
            return client().get(url, headers={"Range": byte_range})
        except httpx.TransportError:
            if attempt == 2:
                raise
            time.sleep(0.4 * (attempt + 1))
    raise AssertionError("tidak tercapai")


def get_range(url: str, start: int, end: int) -> bytes:
    """Byte [start, end) dari berkas."""
    r = _get(url, f"bytes={start}-{end - 1}")
    if r.status_code != 206:
        r.raise_for_status()
        raise Layout(f"server tidak memberi rentang ({r.status_code})")
    return r.content


def _header_bytes(buf: bytes) -> int:
    """Panjang header FITS di awal `buf`, sampai blok yang memuat kartu END."""
    for block in range(0, len(buf) - BLOCK + 1, BLOCK):
        for card in range(block, block + BLOCK, 80):
            if buf[card : card + 8] == b"END     ":
                return block + BLOCK
    raise Layout("kartu END tidak ditemukan")


def _parse(buf: bytes) -> fits.Header:
    return fits.Header.fromstring(buf.decode("ascii"))


class Head:
    """Awal berkas: header IMAGE dan letak datanya."""

    def __init__(self, url: str):
        self.url = url
        buf = get_range(url, 0, HEAD_BYTES)
        n0 = _header_bytes(buf)
        n1 = _header_bytes(buf[n0:])
        self.primary = buf[:n0]
        self.header = _parse(buf[n0 : n0 + n1])
        h = self.header
        if (h.get("NAXIS1"), h.get("NAXIS2"), h.get("BITPIX")) != (DETECTOR_PX, DETECTOR_PX, -32) or "BSCALE" in h:
            raise Layout("HDU IMAGE bukan float32 2040 x 2040 tanpa skala")
        self.image_offset = n0 + n1
        self.row_bytes = DETECTOR_PX * 4
        data = DETECTOR_PX * self.row_bytes
        self.flags_offset = self.image_offset + (data + BLOCK - 1) // BLOCK * BLOCK

    def image_rows(self, ya: int, yb: int, xa: int, xb: int) -> np.ndarray:
        """Piksel IMAGE [ya:yb, xa:xb]. Baris-barisnya bersebelahan di berkas, jadi
        satu rentang; kolom yang tidak dibutuhkan ikut terbaca lalu dibuang."""
        def part(a: int, b: int) -> bytes:
            start = self.image_offset + a * self.row_bytes
            return get_range(self.url, start, start + (b - a) * self.row_bytes)

        if yb - ya <= SPLIT_ROWS:
            buf = part(ya, yb)
        else:
            cuts = list(range(ya, yb, SPLIT_ROWS)) + [yb]
            buf = b"".join(_SPLIT.map(part, cuts[:-1], cuts[1:]))
        rows = np.frombuffer(buf, dtype=">f4").reshape(yb - ya, DETECTOR_PX)
        return rows[:, xa:xb].astype(np.float32)

    def flag_rows(self, ya: int, yb: int, xa: int, xb: int) -> np.ndarray:
        """Piksel FLAGS [ya:yb, xa:xb]. FLAGS adalah citra terkompresi RICE dengan satu
        baris per petak: tabel penunjuk memberi letak tiap baris di heap, dan hanya
        baris yang dibutuhkan yang diunduh lalu dibuka kompresinya oleh astropy."""
        buf = get_range(self.url, self.flags_offset, self.flags_offset + FLAGS_HEAD_BYTES)
        nh = _header_bytes(buf)
        h = _parse(buf[:nh])
        ok = (
            h.get("ZIMAGE")
            and h.get("TFIELDS") == 1
            and str(h.get("TFORM1", "")).startswith("1PB")
            and h.get("NAXIS1") == 8
            and h.get("NAXIS2") == DETECTOR_PX
            and (h.get("ZTILE1"), h.get("ZTILE2")) == (DETECTOR_PX, 1)
            and "THEAP" not in h
        )
        if not ok or len(buf) < nh + 8 * DETECTOR_PX:
            raise Layout("HDU FLAGS bukan citra terkompresi satu baris per petak")
        # Penunjuk per baris: (jumlah byte, letak di heap). Heap mulai tepat setelah tabel.
        table = np.frombuffer(buf[nh : nh + 8 * DETECTOR_PX], dtype=">i4").reshape(DETECTOR_PX, 2)
        sel = table[ya:yb]
        first = int(sel[:, 1].min())
        last = int((sel[:, 1] + sel[:, 0]).max())
        heap_start = self.flags_offset + nh + 8 * DETECTOR_PX
        heap = get_range(self.url, heap_start + first, heap_start + last)

        # FITS kecil yang sah berisi baris-baris itu saja, supaya dibuka oleh astropy sendiri.
        rows = yb - ya
        mini = h.copy()
        mini["NAXIS2"] = rows
        mini["ZNAXIS2"] = rows
        mini["PCOUNT"] = len(heap)
        for key in ("CHECKSUM", "DATASUM"):
            mini.remove(key, ignore_missing=True)
        pointers = sel.copy()
        pointers[:, 1] -= first
        body = pointers.astype(">i4").tobytes() + heap
        body += b"\0" * (-len(body) % BLOCK)
        blob = fits.PrimaryHDU().header.tostring(padding=True).encode("ascii") + mini.tostring(padding=True).encode("ascii") + body
        with fits.open(io.BytesIO(blob)) as small:
            data = np.asarray(small[1].data)
        if data.shape != (rows, DETECTOR_PX):
            raise Layout(f"FLAGS terbuka dengan bentuk {data.shape}")
        return data[:, xa:xb].astype(np.int32)

    def wave_table(self) -> fits.HDUList:
        """HDU WCS-WAVE (tabel panjang gelombang dan lebar pita) di akhir berkas,
        dibungkus supaya bisa dipakai sebagai `fobj` oleh astropy.wcs."""
        r = _get(self.url, f"bytes=-{TAIL_BYTES}")
        if r.status_code != 206:
            r.raise_for_status()
            raise Layout("server tidak memberi akhir berkas")
        tail = r.content
        if not tail.startswith(b"XTENSION= 'BINTABLE'") or b"WCS-WAVE" not in tail[:BLOCK]:
            raise Layout("akhir berkas bukan HDU WCS-WAVE")
        return fits.HDUList.fromstring(self.primary + tail)
