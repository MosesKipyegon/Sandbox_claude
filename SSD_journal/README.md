# SSD Journal

A private travel journal for places visited in South Sudan (and anywhere else), built to work with
**no internet**. A map with a pin for every place, a feed of entries to scroll back through, and
everything saved on your own device.

- **Works offline:** once opened, the app, your entries, your photos and the map areas you've looked at all work without a network.
- **Private:** no accounts, no analytics, no tracking. Nothing leaves your device unless you make a backup.
- **Town-level locations only:** pins are rounded to about 1 km, and photos lose their GPS and other hidden data when you add them.

The 45 UNHAS regular destinations come preloaded as "not yet visited". A few of the names and
locations still need confirming; see [Places](#places).

---

## Run it on your laptop

The app has to be opened through a small local web server. Double-clicking `index.html` won't
work, because browsers only allow offline mode on a proper web address.

1. Open a terminal in the `SSD_journal` folder.
2. Run:
   ```
   python -m http.server 8000
   ```
3. Open **http://localhost:8000** in Chrome or Edge.

Stop the server with `Ctrl+C`. Your journal stays saved in the browser, so it's still there the next time you start the server.

## Put it online for free (GitHub Pages)

The app is plain files, so GitHub Pages can host it for free. The code becomes public, but your
journal does not: entries and photos only ever live on your devices.

**One-time setup:**
1. On GitHub, open the **Sandbox_claude** repository → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then **Branch** to `main` and folder `/ (root)`. Click **Save**.
3. After a minute or two the app is live at:
   **https://moseskipyegon.github.io/Sandbox_claude/SSD_journal/**

**Every time you change the app:**
1. Run `node tools/stamp-sw.js`. This gives the app a new version number, so phones know to update, and warns if a file is missing from the offline list.
2. Commit and push to `main`. GitHub Pages republishes within a minute or two.
3. Next time the app is opened online, it shows **"A new version is ready · Update"**.

## Install it on your Android phone

1. Open the GitHub Pages address above in **Chrome**, while you have internet.
2. Tap **Install app** in the top bar. If you don't see it, use Chrome's **⋮** menu → **Install app** (or **Add to Home screen**).
3. Open SSD Journal from your home screen. It runs full screen like a normal app.
4. **Before going to the field,** open it once while online and pan around the map areas you care about. The map keeps tiles you've viewed for offline use, up to about 40 MB.

Away from the network, everything keeps working, and a small **● Offline** label shows in the top bar.
Other places on the map show the built-in outline of South Sudan and its rivers.

## Back up

Your journal lives in the phone's browser storage. If the app is uninstalled, the browser's data
is cleared or the phone is lost, the journal goes with it, so **back up regularly**. The home
screen reminds you after two weeks.

- **Back up:** **Backup** (top bar) → **Back up now (.zip)**. The file goes to your Downloads folder; move it to Google Drive, email it to yourself or copy it to a USB stick. It contains:
  - `journal.json`: all your text;
  - `photos/`: your photos as ordinary JPEGs you can open anywhere;
  - `entries.csv`: a spreadsheet copy;
  - a `README.txt` explaining how to restore.
- **Restore:** **Backup** → **Choose backup file…**. You'll see what's in the backup first, then pick one of:
  - **Merge**: keeps everything on this device and adds what's new. If the same entry is in both, the most recently edited version wins.
  - **Replace everything**: makes this device match the backup exactly.
- **Move to a new phone or the laptop:** back up on one device and restore (Merge) on the other.
- **Google Sheets:** **Backup** → **Export CSV**, then in Sheets: **File → Import → Upload**. Sample entries are left out.

Automatic sync between phone and laptop through Google Drive is the next step to build.

## Change the look

Everything visual is in **`css/theme.css`**:

| Setting | What it does |
|---|---|
| `--paper`, `--card`, `--ink`, `--ink-soft`, `--line` | Background, cards, text and dividers |
| `--accent` | Buttons and visited pins (terracotta) |
| `--nile`, `--gold`, `--acacia` | Links and rivers, rating stars, "visited" badges |
| `--font-display`, `--font-body` | Fonts: Fraunces for headings, Inter for text |
| `--display-weight` | How heavy headings and place names are |
| `--photo-ratio` | Shape of card photos: `4 / 3`, `3 / 2`, `1 / 1` or `4 / 5` |
| `--map-tile-filter` | Warm tint on the online map (`none` for the original colours) |
| `--map-height`, `--content-width` | Map height, and feed width on a laptop |

- **New fonts:** put the `.woff2` file in `fonts/` and add an `@font-face` at the top of `theme.css`. Also add the file to the list in `sw.js` so it works offline; `node tools/stamp-sw.js` warns if you forget.
- **App icon:** edit `icons/icon.svg`, then run `node tools/build-icons.js`. That needs `npm install sharp` once.

## Places

The UNHAS destinations are listed in **`js/seed-places.js`**. Places marked with a `check:` note
are uncertain:

- **Nimule:** the 45th destination, read from an unlabelled pin on the map.
- **Kuetrengke:** the map's spelling; the original list had "Kuernyangke".
- **Chuil and Mabior:** placed from the map image only.
- About 20 others are approximate but close.

**To correct a place:**
1. Edit its line.
2. Raise `SEED_VERSION` by 1.
3. Run `node tools/stamp-sw.js` and publish.

Phones update those places on their next start; places you've edited yourself are never overwritten. If you **rename** a place, keep its old ID so its entries stay attached. There's an example in the file.

Places that aren't on the list are added from the entry form: type the name, choose **+ Add as a new place**, then use **Pick on map** or **Use my location (town level)**.

## Sample entries

On first open, the journal shows three sample entries (Juba, Bor, Malakal) with drawn placeholder
photos. Tap **Remove samples** on the home screen. They're deleted and won't come back.

## What's where

```
index.html              the page
css/theme.css           colours, fonts and sizes (edit this one)
css/app.css             layout and components
js/                     app code: form, feed, map, photos, backup, offline
data/south-sudan.geojson   built-in offline outline (Natural Earth, public domain)
fonts/  icons/          Fraunces & Inter (SIL Open Font License), app icons
vendor/                 Leaflet (map) and fflate (zip), both stored here so they work offline
sw.js, manifest.webmanifest   offline support and the installable app
tools/                  stamp-sw.js (run before publishing), build-icons.js, build-outline.js
```

Map data © OpenStreetMap contributors. When online, map tiles are loaded from OpenStreetMap,
which sees which map area is being viewed, like any online map. Nothing else is sent anywhere.
