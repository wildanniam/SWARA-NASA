# SWARA

**Sky Watch with Audio & Real-time Access.** A web tool that turns SPHEREx infrared data into images you can blink across time and a spectrum you can hear, so anyone can look for objects that move or change brightness.

**Live: https://swara-nasa.vercel.app** (the tool itself is at [/sky](https://swara-nasa.vercel.app/sky))

Built for the NASA Space Apps Challenge 2026, challenge [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

## What it does

- **Go to a place in the sky.** Type an object name (looked up in SIMBAD and moved to its 2026 position with the catalogue proper motion) or an RA and Dec. Five examples open instantly.
- **Blink the visits.** SPHEREx returns to the same spot roughly every six months. SWARA groups the hundreds of exposures of one position into those visits, builds one aligned image per detector per visit, and flips between them so motion stands out.
- **Read the measured shift.** The position is measured at every visit and shown next to the catalogue value, with its tolerance. When something cannot be measured, the viewer says so.
- **See and hear the spectrum.** Every exposure samples a different wavelength, so the same data gives a 0.75 to 5 micron spectrum. A deterministic mapping in the browser turns it into sound: wavelength becomes time, brightness becomes pitch.
- **Share a link.** The place, its name and the band live in the URL.

## What has been checked

Measured on real SPHEREx data, compared with catalogue proper motion.

| Object | Measured | Catalogue |
|---|---|---|
| Barnard's Star | 9.9″ north in one year | about 10.4″ per year |
| Wolf 359 | 3.9″ west, 2.4″ south in 381 days | 4.0″ west, 2.8″ south |
| Teegarden's Star | 5.2″ in 12 months | 5.1″ per year |
| Epsilon Indi B | 4.8″ east, 4.0″ south in about 16 months | consistent with catalogue |

Known limits:

- SPHEREx pixels are 6.15″, so a few arcseconds per year is about one pixel.
- SPHEREx data starts in April 2025, so each position has 3 or 4 visits.
- Bright stars saturate. Their cores are flagged and their spectra are marked unreliable.
- WISE 0855 is not separated from a background star in SPHEREx; we do not claim to see it.
- The sound mapping has been verified numerically, not yet in a listening study.
- A new position takes 2 to 3.5 minutes to build. The examples are static files.

## Run it locally

The viewer needs Node 20.19 or newer. The pipeline and API need [uv](https://docs.astral.sh/uv/).

```bash
cd web && npm install && npm run dev
```

Open http://localhost:5183 for the landing page and http://localhost:5183/sky for the tool. The examples work without the API. For names and free coordinates, start the API in a second terminal:

```bash
cd pipeline && uv sync && uv run skychange serve
```

## Repository layout

| Folder | Contents |
|---|---|
| `pipeline/` | Python package `skychange`: search, cutouts, frames, spectrum, bundles and the API. See [pipeline/README.md](pipeline/README.md) |
| `bundles/` | Pipeline output for the five examples: frames, `manifest.json`, `spectrum.json`, wide-field image |
| `web/` | Viewer (Vite, React, TypeScript, canvas, Web Audio). Design notes in [web/DESIGN.md](web/DESIGN.md) |

## Data and services

- SPHEREx Level 2 spectral images from the NASA/IPAC Infrared Science Archive (IRSA): image search through the IRSA SIA service, pixels read from the public AWS bucket `nasa-irsa-spherex`.
- Object names and proper motions from SIMBAD through the CDS Sesame name resolver.
- Software: Astropy, NumPy, FastAPI, React, Vite, Phosphor Icons, Archivo and IBM Plex Mono typefaces.

## Use of AI

The idea, product direction and decisions are the team's. AI coding assistants were used to write and test code and documentation under the team's direction.

## License

Copyright (C) 2026 SWARA team.

SWARA is free software under the [GNU Affero General Public License v3.0](LICENSE) or any later version. If you run a modified version for others over a network, you must offer them its source code. This licence lets the sound engine use [Strudel](https://strudel.cc), which is under the AGPL as well.

Earlier versions of this repository were released under the MIT License.

The data comes from NASA SPHEREx and WISE via IRSA and WiseView, and from ESA Gaia; each keeps its own terms.
