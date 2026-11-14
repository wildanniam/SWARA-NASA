import { SCAN, type InstrumentId } from "../sound/mapping";
import type { Note } from "../sound/sonify";

export const VISIT_SLOT_SECONDS = SCAN.columns * SCAN.colSeconds;
export const VISIT_PAUSE_SECONDS = 0.8;

export type CombinedVisit = {
  id: string;
  start: number;
  layers: Record<InstrumentId, boolean>;
};

export type CombinedSoundPlan = {
  notes: Note[];
  visits: CombinedVisit[];
  skipped: { id: string; layers: InstrumentId[] }[];
  activeVoices: InstrumentId[];
  total: number;
};

/** Merge source notes onto one shared, ordered visit clock. */
export function combineSoundLayers(
  windowIds: string[],
  scan: ReadonlyMap<string, Note[]>,
  spectrum: ReadonlyMap<string, Note[]>,
  motion: ReadonlyMap<string, Note>,
  pauseSeconds = VISIT_PAUSE_SECONDS,
): CombinedSoundPlan {
  const voices: InstrumentId[] = ["scan", "spectrum", "motion"];
  const notes: Note[] = [];
  const visits: CombinedVisit[] = [];
  const skipped: CombinedSoundPlan["skipped"] = [];
  const active = new Set<InstrumentId>();

  for (const id of windowIds) {
    const layerNotes = {
      scan: scan.get(id) ?? [],
      spectrum: spectrum.get(id) ?? [],
      motion: motion.has(id) ? [motion.get(id)!] : [],
    };
    const layers = {
      scan: layerNotes.scan.length > 0,
      spectrum: layerNotes.spectrum.length > 0,
      motion: layerNotes.motion.length > 0,
    };
    const missing = voices.filter((voice) => !layers[voice]);
    if (missing.length === voices.length) {
      skipped.push({ id, layers: missing });
      continue;
    }

    const start = visits.length * (VISIT_SLOT_SECONDS + pauseSeconds);
    visits.push({ id, start, layers });
    for (const voice of voices) {
      if (!layers[voice]) continue;
      active.add(voice);
      for (const note of layerNotes[voice]) notes.push({ ...note, t: start + note.t, voice });
    }
    if (missing.length) skipped.push({ id, layers: missing });
  }

  const last = visits[visits.length - 1];
  return {
    notes,
    visits,
    skipped,
    activeVoices: voices.filter((voice) => active.has(voice)),
    total: last ? last.start + VISIT_SLOT_SECONDS : 0,
  };
}
