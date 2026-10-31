// Backups: one .zip with journal.json + photos as plain JPEGs, restore (merge or replace), and CSV export.
//
// Zip layout (format 1):
//   journal.json          places, entries, photo records (no image data) — all incl. deletions
//   photos/<id>.jpg       full-size photos (1600 px long edge)
//   thumbs/<id>.jpg       feed thumbnails
//   entries.csv           the same as "Export CSV", for convenience
//   README.txt            what this file is
import { Zip, ZipPassThrough, ZipDeflate, unzip, strToU8, strFromU8 } from '../vendor/fflate/fflate.js';
import { getAll, getMeta, setMeta, deviceId, mergeRecords, seedPlaces } from './db.js';
import { todayIso } from './dom.js';

const FORMAT = 1;

// ---------- Create ----------
export async function createBackup(onProgress = () => {}) {
  const places = await getAll('places', { includeDeleted: true });
  const entries = await getAll('entries', { includeDeleted: true });
  const photos = await getAll('photos', { includeDeleted: true });

  // Streamed: chunks go straight into a Blob, so large journals don't need one huge buffer
  const parts = [];
  let finish, fail;
  const done = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    parts.push(chunk);
    if (final) finish();
  });
  const add = (name, data, compress) => {
    const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);  // JPEGs are already compressed
    zip.add(file);
    file.push(data, true);
  };

  const json = {
    app: 'ssd-journal', format: FORMAT, exportedAt: new Date().toISOString(), deviceId: await deviceId(),
    places, entries,
    photos: photos.map(({ full, thumb, ...meta }) => meta)
  };
  add('journal.json', strToU8(JSON.stringify(json, null, 1)), true);
  add('entries.csv', strToU8(buildCsv(entries, places)), true);
  add('README.txt', strToU8(README), true);

  const live = photos.filter(p => !p.deleted && p.full);
  for (let i = 0; i < live.length; i++) {
    const p = live[i];
    add(`photos/${p.id}.jpg`, new Uint8Array(await p.full.arrayBuffer()), false);
    if (p.thumb) add(`thumbs/${p.id}.jpg`, new Uint8Array(await p.thumb.arrayBuffer()), false);
    onProgress(i + 1, live.length);
  }
  zip.end();
  await done;

  const counts = { entries: entries.filter(e => !e.deleted).length, photos: live.length };
  return { blob: new Blob(parts, { type: 'application/zip' }), name: `ssd-journal-backup-${todayIso()}.zip`, counts };
}

export async function markBackedUp() {
  await setMeta('lastBackupAt', Date.now());
}

// ---------- Read ----------
/** Opens a backup .zip and checks it. Returns { json, files, summary } for previewing before restoring. */
export async function readBackup(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise((resolve, reject) =>
    unzip(data, (err, out) => err ? reject(new Error('This is not a readable .zip file.')) : resolve(out)));
  if (!files['journal.json']) throw new Error('This zip is not an SSD Journal backup (journal.json is missing).');
  let json;
  try { json = JSON.parse(strFromU8(files['journal.json'])); } catch (e) { throw new Error('journal.json in this backup is damaged.'); }
  if (json.app !== 'ssd-journal') throw new Error('This backup is from a different app.');
  if (json.format > FORMAT) throw new Error('This backup was made by a newer version of SSD Journal. Update the app first.');
  const live = arr => (arr || []).filter(r => !r.deleted);
  return {
    json, files,
    summary: {
      exportedAt: json.exportedAt,
      entries: live(json.entries).length,
      places: live(json.places).filter(p => !p.builtin).length,
      photos: live(json.photos).filter(p => files[`photos/${p.id}.jpg`]).length
    }
  };
}

/** Restores a backup read by readBackup(). mode: 'merge' (default) or 'replace'. */
export async function restoreBackup({ json, files }, mode = 'merge') {
  const photos = [];
  for (const meta of json.photos || []) {
    if (meta.deleted) { photos.push(meta); continue; }
    const full = files[`photos/${meta.id}.jpg`];
    if (!full) continue;                                   // photo file missing from the zip: skip it
    const thumb = files[`thumbs/${meta.id}.jpg`] || full;
    photos.push({
      ...meta,
      full: new Blob([stripJpegMetadata(full)], { type: 'image/jpeg' }),
      thumb: new Blob([stripJpegMetadata(thumb)], { type: 'image/jpeg' })
    });
  }
  const result = await mergeRecords({ places: json.places, entries: json.entries, photos }, { replace: mode === 'replace' });
  await seedPlaces();  // after a replace, make sure every built-in place exists
  return result;
}

/**
 * Removes metadata segments (EXIF/GPS in APP1, Photoshop/IPTC in APP13) from JPEG bytes.
 * Photos saved by the app never have them; this guards against backups edited elsewhere.
 */
export function stripJpegMetadata(bytes) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;   // not a JPEG
  const out = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xFF) {
    const marker = bytes[i + 1];
    if (marker === 0xDA) break;                               // start of image data: copy the rest as-is
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker !== 0xE1 && marker !== 0xED) out.push(bytes.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  out.push(bytes.subarray(i));
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  out.forEach(p => { res.set(p, o); o += p.length; });
  return res;
}

// ---------- CSV ----------
const CSV_COLUMNS = ['place', 'state', 'county', 'date_from', 'date_to', 'reason', 'caption', 'thoughts', 'food',
  'unexpected', 'rating', 'photo_count', 'latitude', 'longitude', 'entry_id'];

export async function createCsv() {
  const entries = await getAll('entries');
  const places = await getAll('places', { includeDeleted: true });
  return { blob: new Blob([buildCsv(entries, places)], { type: 'text/csv;charset=utf-8' }), name: `ssd-journal-entries-${todayIso()}.csv` };
}

function buildCsv(entries, places) {
  const byId = new Map(places.map(p => [p.id, p]));
  const rows = entries
    .filter(e => !e.deleted && !e.sample)
    .sort((a, b) => (a.dateFrom || '').localeCompare(b.dateFrom || ''))
    .map(e => {
      const p = byId.get(e.placeId) || {};
      const reason = e.reason === 'Other' && e.reasonOther ? `Other: ${e.reasonOther}` : e.reason;
      return [p.name, p.state, p.county, e.dateFrom, e.dateTo, reason, e.caption, e.thoughts, e.food,
        e.unexpected, e.rating || '', (e.photoIds || []).length, p.lat, p.lng, e.id];
    });
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+@]/.test(s)) s = "'" + s;                       // stop spreadsheets treating text as a formula
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM so Excel and Sheets read accents and symbols correctly
  return '﻿' + [CSV_COLUMNS, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- Saving files ----------
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** Android share sheet (Drive, WhatsApp, email…) when the browser supports sharing this file type. */
export function canShareFile(blob, name) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); }
  catch (e) { return false; }
}
export function shareBlob(blob, name, title) {
  return navigator.share({ files: [new File([blob], name, { type: blob.type })], title });
}

export async function lastBackupAt() { return getMeta('lastBackupAt', null); }

const README = `SSD Journal backup
==================

This file is a complete backup of your SSD Journal: every entry, place and photo.

To restore it: open SSD Journal → Backup → "Restore from a backup" and choose this .zip.

Inside:
  journal.json   all your entries, places and photo details (text)
  photos/        your photos as ordinary JPEG files (location data removed)
  thumbs/        small versions of the photos used in the feed
  entries.csv    your entries as a spreadsheet (same as "Export CSV")

Keep a copy somewhere safe — e.g. Google Drive or a USB stick.
`;
