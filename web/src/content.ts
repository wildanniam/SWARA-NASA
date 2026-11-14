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
