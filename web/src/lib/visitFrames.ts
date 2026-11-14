/** Frame band yang tersedia pada satu kunjungan; tidak semua visit punya semua band. */
export function framesForWindow<T extends { window: string }>(frames: readonly T[], windowId: string): T[] {
  return frames.filter((frame) => frame.window === windowId);
}

/** Pilih band utama jika siap, atau frame siap lain agar visit tetap tampil. */
export function readyFrameForWindow<T extends { window: string; band: string }>(
  frames: readonly T[],
  windowId: string,
  preferredBand: string | undefined,
  isReady: (frame: T) => boolean,
): T | undefined {
  const visits = framesForWindow(frames, windowId);
  return (
    visits.find((frame) => frame.band === preferredBand && isReady(frame)) ??
    visits.find(isReady)
  );
}
