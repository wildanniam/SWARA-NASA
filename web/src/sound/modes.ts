// Empat mode suara: definisi, label, shortcut, dan teks pengumuman.
// Logika murni tanpa Web Audio, supaya bisa diuji tanpa browser.

export type ModeId = "gerak" | "kecerahan" | "pindai" | "spektrum";

export type SoundMode = {
  id: ModeId;
  /** Label Inggris untuk antarmuka. */
  label: string;
  /** Huruf shortcut: dipakai bersama Alt. */
  key: string;
  /** Dibacakan screen reader dan tampil di status saat ganti mode. */
  announcement: string;
};

export const MODES: SoundMode[] = [
  {
    id: "gerak",
    label: "Motion",
    key: "g",
    announcement: "Motion mode: one note per visit, north is higher.",
  },
  {
    id: "kecerahan",
    label: "Brightness",
    key: "k",
    announcement: "Brightness mode: one note per visit, brighter is higher.",
  },
  {
    id: "pindai",
    label: "Scan",
    key: "p",
    announcement: "Scan mode: columns play left to right, higher is further north, louder is brighter.",
  },
  {
    id: "spektrum",
    label: "Spectrum",
    key: "s",
    announcement: "Spectrum mode: 48 notes from short to long wavelength, higher is brighter.",
  },
];

/** Tombol yang sudah dipakai perilaku existing; shortcut mode tidak boleh menyentuhnya. */
export const RESERVED_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "l",
  "m",
  "/",
  "n",
  " ",
  "arrowleft",
  "arrowright",
];

export function modeById(id: string): SoundMode | undefined {
  return MODES.find((m) => m.id === id);
}

/** Huruf tombol (tanpa Alt) menjadi mode, atau undefined kalau bukan shortcut mode. */
export function modeForKey(key: string): SoundMode | undefined {
  const k = key.toLowerCase();
  if (RESERVED_KEYS.includes(k)) return undefined;
  return MODES.find((m) => m.key === k);
}
