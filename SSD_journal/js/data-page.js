// "Backup" screen: back up (.zip), restore (merge or replace), export CSV, storage status.
import { h } from './dom.js';
import { getAll, requestPersistence } from './db.js';
import {
  createBackup, markBackedUp, readBackup, restoreBackup, createCsv,
  downloadBlob, canShareFile, shareBlob, lastBackupAt
} from './backup.js';
import { renderSyncPanel } from './sync-ui.js';
import { scheduleSync } from './sync.js';

export async function renderDataPage(app) {
  const entries = (await getAll('entries')).filter(e => !e.sample);
  const last = await lastBackupAt();

  app.textContent = '';
  app.append(h('header', { class: 'page-head' },
    h('a', { class: 'back', href: '#/' }, '← Journal'),
    h('h1', {}, 'Backup & data'),
    h('p', { class: 'hint' }, 'Your journal is stored on this device (and in your Google Drive if you turn on sync). Keep a backup somewhere safe too.')));

  app.append(await renderSyncPanel());

  // ---------- Back up ----------
  const backupStatus = h('p', { class: 'hint', role: 'status' });
  const backupBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Back up now (.zip)');
  const shareBtn = h('button', { type: 'button', class: 'btn btn-quiet', hidden: true }, 'Share backup…');
  let made = null;
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    try {
      made = await createBackup((i, n) => { backupStatus.textContent = `Packing photos… ${i} of ${n}`; });
      downloadBlob(made.blob, made.name);
      await markBackedUp();
      backupStatus.textContent = `Saved ${made.name} — ${made.counts.entries} entries, ${made.counts.photos} photos, ${mb(made.blob.size)}. Check your Downloads folder.`;
      shareBtn.hidden = !canShareFile(made.blob, made.name);
    } catch (e) {
      backupStatus.textContent = 'Backup failed: ' + (e.message || e);
    }
    backupBtn.disabled = false;
  });
  shareBtn.addEventListener('click', () => made && shareBlob(made.blob, made.name, 'SSD Journal backup').catch(() => {}));

  app.append(section('Back up',
    h('p', {}, last ? `Last backup: ${ago(last)}.` : 'You haven’t made a backup yet.'),
    h('p', { class: 'hint' }, 'One .zip file with every entry, place and photo. Put it in Google Drive, email it to yourself or copy it to a USB stick.'),
    h('div', { class: 'actions' }, backupBtn, shareBtn),
    backupStatus));

  // ---------- Restore ----------
  const fileIn = h('input', { type: 'file', accept: '.zip,application/zip', id: 'restore-file', class: 'visually-hidden' });
  const restoreBox = h('div', { class: 'restore-box' });
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    restoreBox.textContent = 'Reading backup…';
    try {
      const backup = await readBackup(file);
      showRestoreChoice(restoreBox, backup, file.name);
    } catch (e) {
      restoreBox.textContent = '';
      restoreBox.append(h('p', { class: 'form-error' }, e.message || String(e)));
    }
  });
  app.append(section('Restore from a backup',
    h('p', { class: 'hint' }, 'Choose a backup .zip. You’ll see what’s in it before anything changes.'),
    h('label', { class: 'btn btn-quiet', for: 'restore-file' }, 'Choose backup file…'), fileIn,
    restoreBox));

  // ---------- CSV ----------
  const csvStatus = h('p', { class: 'hint', role: 'status' });
  app.append(section('Export to a spreadsheet',
    h('p', { class: 'hint' }, 'A .csv with the text of every entry (no photos) — opens in Google Sheets or Excel.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: !entries.length, onclick: async () => {
        const csv = await createCsv();
        downloadBlob(csv.blob, csv.name);
        csvStatus.textContent = `Saved ${csv.name}. In Google Sheets: File → Import → Upload.`;
      } }, 'Export CSV')),
    entries.length ? csvStatus : h('p', { class: 'hint' }, 'Add an entry first — sample entries aren’t exported.')));

  // ---------- Storage ----------
  const storage = h('p', { class: 'hint' }, 'Checking storage…');
  app.append(section('Storage on this device', storage));
  const persisted = await requestPersistence();
  let used = '';
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    used = `Using ${mb(usage)} of about ${mb(quota)} available. `;
  }
  storage.textContent = used + (persisted
    ? 'This browser has agreed to keep your journal even when space runs low.'
    : 'This browser may clear the journal if the device runs very low on space — installing the app and keeping backups protects it.');
}

function showRestoreChoice(box, backup, fileName) {
  const s = backup.summary;
  const status = h('p', { role: 'status' });
  const run = mode => async () => {
    if (mode === 'replace' && !confirm('Replace everything on this device with this backup? Entries that are only on this device will be lost.')) return;
    box.querySelectorAll('button').forEach(b => { b.disabled = true; });
    status.textContent = 'Restoring…';
    try {
      const r = await restoreBackup(backup, mode);
      const changed = r.entries.added + r.entries.updated;
      status.textContent = mode === 'replace'
        ? `Done — the journal now matches the backup (${s.entries} entries, ${s.photos} photos).`
        : `Done — ${n(r.entries.added, 'entry', 'entries')} added, ${r.entries.updated} updated, ${r.entries.kept} already up to date; ${n(r.photos.added, 'photo', 'photos')} added.`;
      if (changed || mode === 'replace') status.append(' ', h('a', { href: '#/' }, 'Open the journal'));
      scheduleSync(500);
    } catch (e) {
      status.textContent = 'Restore failed: ' + (e.message || e);
    }
  };
  box.textContent = '';
  box.append(
    h('div', { class: 'restore-summary' },
      h('strong', {}, fileName),
      h('p', { class: 'hint' }, `Made ${s.exportedAt ? new Date(s.exportedAt).toLocaleString() : 'at an unknown time'} · ${s.entries} entries · ${s.places} places you added · ${s.photos} photos`)),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: run('merge') }, 'Merge into my journal'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: run('replace') }, 'Replace everything')),
    h('p', { class: 'hint' }, 'Merge keeps everything on this device and adds what’s new; where the same entry exists in both, the most recently edited version wins.'),
    status);
}

function section(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', {}, title), ...children);
}

const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const mb = bytes => bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0) + ' MB';

export function ago(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
