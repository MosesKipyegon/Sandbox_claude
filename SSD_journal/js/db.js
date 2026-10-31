// Local storage (IndexedDB). Every record carries id, updatedAt and deleted so devices can sync later:
// deletions are kept as "tombstones" (deleted: true) instead of being removed.
import { UNHAS_PLACES, SEED_VERSION } from './seed-places.js';

const DB_NAME = 'ssd-journal';
const DB_VERSION = 1;
let dbPromise;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const places = db.createObjectStore('places', { keyPath: 'id' });
        places.createIndex('updatedAt', 'updatedAt');
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('placeId', 'placeId');
        entries.createIndex('updatedAt', 'updatedAt');
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('entryId', 'entryId');
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const asPromise = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Runs fn(tx) inside one transaction; resolves when the transaction commits. */
async function inTx(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    try { result = fn(tx); } catch (e) { tx.abort(); reject(e); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Generic reads ----------
export async function getAll(store, { includeDeleted = false } = {}) {
  const db = await openDb();
  const all = await asPromise(db.transaction(store).objectStore(store).getAll());
  return includeDeleted ? all : all.filter(r => !r.deleted);
}

export async function get(store, id) {
  const db = await openDb();
  return asPromise(db.transaction(store).objectStore(store).get(id));
}

// ---------- Meta ----------
export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return inTx(['meta'], 'readwrite', tx => { tx.objectStore('meta').put({ key, value }); });
}

export async function deviceId() {
  let id = await getMeta('deviceId');
  if (!id) { id = newId(); await setMeta('deviceId', id); }
  return id;
}

// ---------- Places ----------
/**
 * Adds built-in places this device doesn't have yet, and — when SEED_VERSION goes up — refreshes
 * built-in places that haven't been edited on any device (updatedAt 0). Never overwrites edits.
 */
export async function seedPlaces() {
  const done = await getMeta('seedVersion', 0);
  if (done >= SEED_VERSION) return;
  const existing = new Map((await getAll('places', { includeDeleted: true })).map(p => [p.id, p]));
  const now = Date.now();
  await inTx(['places', 'meta'], 'readwrite', tx => {
    const store = tx.objectStore('places');
    UNHAS_PLACES.forEach(p => {
      const old = existing.get(p.id);
      // updatedAt 0: a seed is the oldest possible version, so any edit (on any device) wins in sync
      if (!old || (old.builtin && !old.updatedAt && !old.deleted)) {
        store.put({ ...p, createdAt: old ? old.createdAt : now, updatedAt: 0, deleted: false });
      }
    });
    tx.objectStore('meta').put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

/** Town-level only: coordinates are always rounded to 2 decimals (~1 km). */
export const roundCoord = n => Math.round(Number(n) * 100) / 100;

export function savePlace(place) {
  const now = Date.now();
  const rec = {
    unhas: false, builtin: false, county: '', deleted: false, createdAt: now,
    ...place,
    id: place.id || newId(),
    lat: roundCoord(place.lat), lng: roundCoord(place.lng),
    updatedAt: now
  };
  return inTx(['places'], 'readwrite', tx => { tx.objectStore('places').put(rec); return rec; });
}

// ---------- Entries & photos ----------
/**
 * Saves an entry with its photos in one transaction.
 * newPhotos: [{id, full, thumb, width, height}] — already resized.
 * removedPhotoIds: photos to tombstone (their image data is dropped).
 */
export function saveEntry(entry, newPhotos = [], removedPhotoIds = []) {
  const now = Date.now();
  const rec = {
    dateTo: '', reason: '', reasonOther: '', caption: '', thoughts: '', food: '', unexpected: '',
    rating: null, photoIds: [], sample: false, deleted: false, createdAt: now,
    ...entry,
    id: entry.id || newId(),
    updatedAt: now
  };
  return inTx(['entries', 'photos'], 'readwrite', tx => {
    const photos = tx.objectStore('photos');
    newPhotos.forEach(p => photos.put({ ...p, entryId: rec.id, createdAt: now, updatedAt: now, deleted: false }));
    removedPhotoIds.forEach(id => photos.put({ id, entryId: rec.id, deleted: true, updatedAt: now }));
    tx.objectStore('entries').put(rec);
    return rec;
  });
}

export async function deleteEntry(id) {
  const entry = await get('entries', id);
  if (!entry) return;
  const now = Date.now();
  await inTx(['entries', 'photos'], 'readwrite', tx => {
    const photos = tx.objectStore('photos');
    (entry.photoIds || []).forEach(pid => photos.put({ id: pid, entryId: id, deleted: true, updatedAt: now }));
    tx.objectStore('entries').put({ ...entry, deleted: true, updatedAt: now });
  });
}

/** Stores downloaded image data for a photo. Not an edit: updatedAt is unchanged, so it doesn't sync back. */
export async function putPhotoBlobs(id, blobs) {
  const p = await get('photos', id);
  if (!p || p.deleted) return;
  await inTx(['photos'], 'readwrite', tx => { tx.objectStore('photos').put({ ...p, ...blobs }); });
}

// ---------- Merge (restore and Drive sync) ----------
const STORES = ['places', 'entries', 'photos'];

/**
 * Merges records into the local stores. For each id the newer version (updatedAt) wins, so merging
 * the same data twice changes nothing, and deletions (tombstones) carry over.
 * replace: wipe places/entries/photos first (meta such as deviceId is kept).
 * Returns { places: {added, updated, kept}, entries: {...}, photos: {...} }.
 */
export async function mergeRecords(incoming, { replace = false, keepBlobs = false } = {}) {
  const result = {};
  const existing = {};
  for (const s of STORES) {
    existing[s] = replace ? new Map() : new Map((await getAll(s, { includeDeleted: true })).map(r => [r.id, r]));
    result[s] = { added: 0, updated: 0, kept: 0 };
  }
  await inTx(STORES, 'readwrite', tx => {
    for (const s of STORES) {
      const store = tx.objectStore(s);
      if (replace) store.clear();
      for (const rec of incoming[s] || []) {
        if (!rec || typeof rec.id !== 'string') continue;
        const old = existing[s].get(rec.id);
        if (!old) { store.put(rec); result[s].added++; }
        else if ((rec.updatedAt || 0) > (old.updatedAt || 0)) {
          // Sync sends photo details without the images: keep the images already on this device
          const merged = keepBlobs && s === 'photos' && !rec.deleted ? { ...rec, full: rec.full || old.full, thumb: rec.thumb || old.thumb } : rec;
          store.put(merged);
          result[s].updated++;
        }
        else result[s].kept++;
      }
    }
  });
  return result;
}

/** Ask the browser not to clear our data when storage runs low (important on Android). */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
