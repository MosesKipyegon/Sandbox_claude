# SSD Journal — project brief

Personal travel journal web app for places visited in South Sudan (and later elsewhere).
Moves between remote field locations with unreliable power and internet, so offline use matters more than anything else.

## What it does
- A map of South Sudan at the top with a pin for every place visited.
- Below the map, a scrollable feed of entry cards, newest first, to slowly scroll through and recap.
- Each entry has:
  - Place name, state, county (optional)
  - Date(s) visited
  - Reason for the visit (work trip, transit, leave, etc.)
  - 1 to 5 photos
  - Short caption (one line)
  - "What I actually think of the place" (free text)
  - Food I enjoyed
  - "Something I did not expect to find here"
  - Optional rating out of 5
- Tapping a pin opens that place's entry or entries. A place can have several visits.
- A simple add/edit form that is quick to fill on a phone. Adding an entry should take under 2 minutes.
- Basic stats at the top, e.g. "14 of 45 UNHAS destinations visited" and the number of states covered.

## Seed list
Preload the 45 UNHAS regular destinations as "not yet visited" places, with approximate town-level coordinates.
From the UNHAS South Sudan routes map (18 May 2026), these include: Juba, Bor, Rumbek, Wau, Aweil, Yambio, Yei,
Kajo Keji, Torit, Kapoeta, Malakal, Renk, Maban, Rubkona, Kuajok, Agok, Mankien, Yida, Ajuong Thok, Koch, Leer,
Nyal, Ganyiel, Old Fangak, New Fangak, Kurwai, Ayod, Duk Padiet, Duk Pockat, Mabior, Yuai, Pieri, Motot, Lankien,
Walgak, Chuil, Ulang, Kuernyangke, Akobo, Pibor, Pochalla, Boma, Mathiang, Maiwut.
(If the map image is in this folder, read it to check the names and fill any gaps. Flag any spelling or coordinates
that are uncertain rather than guessing silently.) Must be able to add places that are not on this list.

## Technical requirements
- Offline first: works fully with no network once loaded, as an installable PWA with a service worker.
  All data stored locally in IndexedDB.
- Photos compressed and resized in the browser before saving (long edge around 1600px).
- Map uses Leaflet with OpenStreetMap tiles when online. Offline, falls back to a simple built-in outline of
  South Sudan with the pins still visible. Cache tiles already viewed.
- Export and import:
  - Full backup as a single file (JSON with embedded photos, or a zip).
  - CSV export of the text fields with the same columns as above, to keep a copy in Google Sheets.
- Mobile first, and should also look good on a laptop.
- Simple stack: plain HTML/CSS/JS, or a minimal setup that builds to static files, hostable for free
  (e.g. GitHub Pages) or opened locally.

## Privacy
- Private by default. No accounts, analytics or third-party tracking.
- Coordinates at town level only, never exact GPS of compounds or offices. Strip GPS EXIF from photos on import.

## Design
Clean, warm, journal-like feel: generous photo space, good typography, no clutter.
Colors and fonts easy to change in one place (CSS variables).

## How to work
1. Before writing code, a short plan: file structure, data model, how offline and backups work. Ask questions
   that would change the build.
2. Build in small testable steps: (a) data model + add form, (b) feed of cards, (c) map + pins,
   (d) offline/PWA, (e) export/import, (f) design polish.
3. Add 2 to 3 sample entries with placeholder images, easy to delete.
4. At the end, a short README: run locally, put online for free, install on Android, back up.
