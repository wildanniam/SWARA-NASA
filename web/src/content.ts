// Teks per target. Draf dari hasil pipeline 2026-11-13; perlu ditinjau tim konten.

export const KIND_LABEL = { moving: "Moves", variable: "Changes brightness", custom: "Your coordinates" } as const;
export const SEARCH_LABEL = "Your search";

export const CUSTOM_NOTE =
  "SPHEREx images centred on the coordinates you entered. Blink between visits and watch for anything that shifts or changes brightness.";

/** Teks untuk benda yang dicari dengan nama; gerak katalog disebut supaya bisa dibandingkan dengan yang terukur. */
export function searchNote(name: string, pmArcsecYr?: number | null): string {
  const where = `SPHEREx images centred on where the SIMBAD catalogue places ${name} in 2026.`;
  if (pmArcsecYr == null) return `${where} The catalogue lists no motion for it, so this is its position in 2000.`;
  if (pmArcsecYr < 0.1) return `${where} The catalogue lists almost no motion for it.`;
  return `${where} The catalogue says it moves about ${pmArcsecYr.toFixed(1)}″ per year. Blink and compare.`;
}

/** Benda contoh yang di data SPHEREx tidak terpisah dari bintang latar. Yang terukur di
 *  posisinya bukan benda itu, jadi kartu berbagi tidak menyebut gerak atau cahayanya. */
export const BLENDED: Record<string, string> = {
  wise0855: "SPHEREx could not separate it from a background star here",
};

export const TARGET_NOTES: Record<string, string> = {
  barnard:
    "The star with the fastest apparent motion in our sky. Blink between visits and it steps north, away from the mark, while the faint stars around it stay put.",
  epsindb:
    "A pair of brown dwarfs about 12 light-years away. They drift south-east by roughly one SPHEREx pixel between the first and last visit, so the step is small.",
  rwaur:
    "A young star that stays in place but changes brightness between visits. The change is strongest in the long-wavelength bands.",
  wise0855:
    "One of the coldest known brown dwarfs should be crossing this spot. A background star sits at the same position and we could not separate the two in this data.",
  rdra:
    "A giant pulsating star, too bright for SPHEREx: its core is saturated in every band, so this view shows the limits of the data rather than a clean measurement.",
};

/** Kenapa lima benda contoh ini dipilih. Challenge NASA menyebut kelimanya sebagai target uji,
 *  dan tiap benda menguji hal yang berbeda. Dipakai penanda dan cuplikan di peta seluruh langit
 *  serta bagian contoh di landing page, supaya kata-katanya selalu sama.
 *  Faktanya (jarak, tahun, periode) dari pustaka umum; perlu ditinjau tim konten. */
export type Why = {
  /** Urutan di daftar contoh, 1 sampai 5. */
  n: number;
  /** Di bawah nama penanda di peta: benda ini apa, dalam beberapa kata. */
  tag: string;
  /** Yang diujinya, dalam beberapa kata. */
  test: string;
  /** Satu atau dua kalimat: kenapa benda ini istimewa. */
  why: string;
};

export const TEST_COUNT = 5;

export const TARGET_WHY: Record<string, Why> = {
  barnard: {
    n: 1,
    tag: "fastest star in our sky",
    test: "fast motion",
    why: "No star crosses our sky faster, and only the Alpha Centauri system lies closer to the Sun. It is about 6 light-years away.",
  },
  wise0855: {
    n: 2,
    tag: "coldest brown dwarf known",
    test: "a faint, cold world",
    why: "The coldest brown dwarf known, colder than ice and about 7 light-years away. It was found in 2014 because a faint dot moved between WISE images.",
  },
  epsindb: {
    n: 3,
    tag: "a pair of brown dwarfs",
    test: "a small step and a spectrum",
    why: "Two brown dwarfs, too small to shine like stars, about 12 light-years away. They glow in infrared, the light SPHEREx sees.",
  },
  rwaur: {
    n: 4,
    tag: "a young star that dims",
    test: "changing brightness, not motion",
    why: "A young star still gathering gas and dust, known for fading deeply and without warning.",
  },
  rdra: {
    n: 5,
    tag: "a pulsing giant star",
    test: "where the data runs out",
    why: "An old giant star that swells and shrinks, brightening and fading about every eight months. It is bright enough to overwhelm SPHEREx.",
  },
};
