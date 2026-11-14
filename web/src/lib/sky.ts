// Klien API koordinat bebas (`skychange serve`, lihat pipeline/src/skychange/server.py).

export type SkyJob = {
  id: string;
  ra: number;
  dec: number;
  status: "queued" | "running" | "ready" | "error";
  stage: "" | "search" | "fetch" | "frames";
  done: number;
  total: number;
  error: "" | "no_data" | "failed";
};

const API = `${import.meta.env.BASE_URL}api`;

/** Penolakan yang pesannya layak ditampilkan apa adanya ke pengguna. */
export class SkyRequestError extends Error {}

async function read(res: Response): Promise<SkyJob> {
  if (res.ok) return (await res.json()) as SkyJob;
  const detail = await res
    .json()
    .then((d) => d?.detail)
    .catch(() => undefined);
  if ((res.status === 422 || res.status === 503 || res.status === 404) && typeof detail === "string") {
    throw new SkyRequestError(detail);
  }
  throw new Error(`sky API: HTTP ${res.status}`);
}

/** Minta bundle untuk satu koordinat. Teks RA/Dec dibaca di server (derajat atau jam-menit-detik). */
export const requestSky = (ra: string, dec: string) =>
  fetch(`${API}/sky`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ra, dec }),
  }).then(read);

export const skyStatus = (id: string, signal?: AbortSignal) => fetch(`${API}/sky/${id}`, { signal }).then(read);

export const isPending = (job?: SkyJob) => job?.status === "queued" || job?.status === "running";
