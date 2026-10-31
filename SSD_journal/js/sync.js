// Google Drive sync. In your Drive:
//   SSD Journal/journal.json            every place, entry and photo record (text only, incl. deletions)
//   SSD Journal/photos/<id>.jpg         full photos
//   SSD Journal/photos/<id>.thumb.jpg   thumbnails
//
// One sync = fetch journal.json → merge into this device (newest edit wins per record) →
// upload new photos → upload the merged journal.json. Running it twice changes nothing, and two
// devices that sync at the same moment catch up on their next sync, because merging only ever adds
// the newer version of each record.
import { getAll, getMeta, setMeta, mergeRecords, putPhotoBlobs } from './db.js';
import { DRIVE_FOLDER } from './config.js';
import {
  isConfigured, getToken, signOut, whoAmI, ensureFolder, listFolder, download, uploadFile, replaceFile,
  deleteFile, loadGoogleSignIn, AuthNeeded
} from './drive.js';

// ---------- Status (for the top bar and the Backup page) ----------
// state: 'off' | 'idle' | 'syncing' | 'needs-auth' | 'offline' | 'error'
let status = { state: 'off' };
const listeners = new Set();
export const getSyncStatus = () => status;
export function onSyncStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); }
function setStatus(next) { status = { ...next }; listeners.forEach(fn => fn(status)); }

/** Called once at start-up. */
export async function initSync() {
  if (!isConfigured() || !(await getMeta('driveAccount'))) { setStatus({ state: 'off' }); return; }
  setStatus({ state: 'idle', lastSyncAt: await getMeta('lastSyncAt') });
  window.addEventListener('online', () => scheduleSync(1500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(1500); });
  if (navigator.onLine) loadGoogleSignIn().catch(() => {});  // ready for a quick tap-to-sync later
  scheduleSync(800);
}

let timer = null;
/** Sync soon (e.g. after saving). Quietly does nothing if Drive isn't connected. */
export function scheduleSync(delay = 3000) {
  if (status.state === 'off') return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), delay);
}

// ---------- Connect / disconnect ----------
export async function connectDrive() {
  const token = await getToken({ interactive: true });
  const user = await whoAmI(token);
  await setMeta('driveAccount', { email: user.emailAddress || '', name: user.displayName || '' });
  setStatus({ state: 'idle', lastSyncAt: null });
  initSync();
  return syncNow();
}

export async function disconnectDrive() {
  clearTimeout(timer);
  await signOut();
  for (const key of ['driveAccount', 'driveIds', 'lastSyncAt', 'drivePhotoFiles']) await setMeta(key, null);
  setStatus({ state: 'off' });
}

export const driveAccount = () => getMeta('driveAccount');

// ---------- Sync ----------
let running = null;

/**
 * interactive: true when the user tapped "Sync" — allows Google's sign-in to appear if the hour is up.
 * downloadAll: also fetch every full-size photo (for going offline).
 * Returns { changed } — true if this device received anything new.
 */
export function syncNow({ interactive = false, downloadAll = false } = {}) {
  if (running) return running;
  running = runSync(interactive, downloadAll).finally(() => { running = null; });
  return running;
}

async function runSync(interactive, downloadAll) {
  const lastSyncAt = await getMeta('lastSyncAt');
  if (!navigator.onLine) { setStatus({ state: 'offline', lastSyncAt }); return { changed: false }; }
  try {
    const token = await getToken({ interactive });
    if (!token) { setStatus({ state: 'needs-auth', lastSyncAt }); return { changed: false }; }
    setStatus({ state: 'syncing', detail: 'Checking Google Drive…', lastSyncAt });

    const ids = await folders(token);
    const files = await listFolder(token, ids.root);
    const journalId = files.get('journal.json');

    // 1. Bring in the other devices' changes
    let changed = false;
    let remoteSig = '';
    if (journalId) {
      const remote = JSON.parse(await download(token, journalId, 'text'));
      remoteSig = signature(remote.places, remote.entries, remote.photos);
      const r = await mergeRecords({ places: remote.places, entries: remote.entries, photos: remote.photos }, { keepBlobs: true });
      changed = ['places', 'entries', 'photos'].some(s => r[s].added + r[s].updated > 0);
    }

    // 2. Photos: upload new ones, remove deleted ones, fetch missing thumbnails
    const photos = await getAll('photos', { includeDeleted: true });
    const remotePhotos = await listFolder(token, ids.photos);
    const toUpload = photos.filter(p => !p.deleted && p.full && !remotePhotos.has(`${p.id}.jpg`));
    for (const [i, p] of toUpload.entries()) {
      setStatus({ state: 'syncing', detail: `Uploading photos… ${i + 1} of ${toUpload.length}`, lastSyncAt });
      remotePhotos.set(`${p.id}.jpg`, await uploadFile(token, `${p.id}.jpg`, ids.photos, p.full, 'image/jpeg'));
      if (p.thumb) remotePhotos.set(`${p.id}.thumb.jpg`, await uploadFile(token, `${p.id}.thumb.jpg`, ids.photos, p.thumb, 'image/jpeg'));
    }
    for (const p of photos.filter(p => p.deleted)) {
      for (const name of [`${p.id}.jpg`, `${p.id}.thumb.jpg`]) {
        if (remotePhotos.has(name)) { await deleteFile(token, remotePhotos.get(name)); remotePhotos.delete(name); }
      }
    }
    await setMeta('drivePhotoFiles', Object.fromEntries(remotePhotos));
    const missing = photos.filter(p => !p.deleted && (!p.thumb || (downloadAll && !p.full)));
    for (const [i, p] of missing.entries()) {
      setStatus({ state: 'syncing', detail: `Downloading photos… ${i + 1} of ${missing.length}`, lastSyncAt });
      const blobs = {};
      if (!p.thumb && remotePhotos.has(`${p.id}.thumb.jpg`)) blobs.thumb = await download(token, remotePhotos.get(`${p.id}.thumb.jpg`));
      if (downloadAll && !p.full && remotePhotos.has(`${p.id}.jpg`)) blobs.full = await download(token, remotePhotos.get(`${p.id}.jpg`));
      if (Object.keys(blobs).length) { await putPhotoBlobs(p.id, blobs); changed = true; }
    }

    // 3. Upload the merged journal if Drive's copy is out of date
    const places = await getAll('places', { includeDeleted: true });
    const entries = await getAll('entries', { includeDeleted: true });
    const photoMeta = (await getAll('photos', { includeDeleted: true })).map(({ full, thumb, ...m }) => m);
    if (signature(places, entries, photoMeta) !== remoteSig) {
      setStatus({ state: 'syncing', detail: 'Saving to Google Drive…', lastSyncAt });
      const blob = new Blob([JSON.stringify({ app: 'ssd-journal', format: 1, savedAt: new Date().toISOString(), places, entries, photos: photoMeta })], { type: 'application/json' });
      if (journalId) await replaceFile(token, journalId, blob, 'application/json');
      else await uploadFile(token, 'journal.json', ids.root, blob, 'application/json');
    }

    const now = Date.now();
    await setMeta('lastSyncAt', now);
    setStatus({ state: 'idle', lastSyncAt: now, changed });
    if (changed) window.dispatchEvent(new CustomEvent('ssd:synced'));
    return { changed };
  } catch (e) {
    if (e instanceof AuthNeeded) { setStatus({ state: 'needs-auth', lastSyncAt }); return { changed: false }; }
    // A folder deleted in Drive: forget it, and the next sync makes a new one
    if (/ 404/.test(e.message)) await setMeta('driveIds', null);
    setStatus({ state: 'error', message: e.message || String(e), lastSyncAt });
    throw e;
  }
}

async function folders(token) {
  const saved = await getMeta('driveIds');
  if (saved && saved.root && saved.photos) return saved;
  const root = await ensureFolder(token, DRIVE_FOLDER, 'root');
  const photos = await ensureFolder(token, 'photos', root);
  const ids = { root, photos };
  await setMeta('driveIds', ids);
  return ids;
}

/** A short fingerprint of every record's version, to tell whether Drive's copy needs updating. */
function signature(places = [], entries = [], photos = []) {
  const part = list => list.map(r => `${r.id}:${r.updatedAt || 0}:${r.deleted ? 1 : 0}`).sort().join('|');
  return part(places) + '#' + part(entries) + '#' + part(photos);
}

// ---------- Full-size photos on demand ----------
/** Downloads one full-size photo from Drive (when shown in the feed or viewer). Returns the blob or null. */
export async function fetchFullPhoto(photoId) {
  if (status.state === 'off' || !navigator.onLine) return null;
  try {
    const files = (await getMeta('drivePhotoFiles')) || {};
    const fileId = files[`${photoId}.jpg`];
    const token = fileId && await getToken();
    if (!token) return null;
    const blob = await download(token, fileId);
    await putPhotoBlobs(photoId, { full: blob });
    return blob;
  } catch (e) {
    return null;
  }
}

/** Photos whose full-size version is only in Drive (not on this device). */
export async function photosOnlyInDrive() {
  const photos = await getAll('photos');
  return photos.filter(p => !p.full).length;
}
