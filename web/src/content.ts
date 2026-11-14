// Teks per target. Draf dari hasil pipeline 2026-11-13; perlu ditinjau tim konten.

export const KIND_LABEL = { moving: "Moves", variable: "Changes brightness" } as const;

export const TARGET_NOTES: Record<string, string> = {
  barnard:
    "The star with the fastest apparent motion in our sky. Blink between visits and it steps north, away from the mark, while the faint stars around it stay put.",
  epsindb:
    "A pair of brown dwarfs about 12 light-years away. They drift south-east by roughly one SPHEREx pixel over 16 months, so the step is small.",
  rwaur:
    "A young star that stays in place but changes brightness between visits. The change is strongest in the long-wavelength bands.",
  wise0855:
    "One of the coldest known brown dwarfs should be crossing this spot. A background star sits at the same position and we could not separate the two in this data.",
  rdra:
    "A giant pulsating star, too bright for SPHEREx: its core is saturated in every band, so this view shows the limits of the data rather than a clean measurement.",
};
