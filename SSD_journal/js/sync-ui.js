// Sync controls: the status button in the top bar, and the Google Drive panel on the Backup page.
import { h } from './dom.js';
import { isConfigured } from './drive.js';
import { onSyncStatus, syncNow, connectDrive, disconnectDrive, driveAccount, photosOnlyInDrive } from './sync.js';

const since = ts => {
  if (!ts) return 'never';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  return hrs < 24 ? `${hrs} h ago` : new Date(ts).toLocaleDateString();
};

/** Top-bar button: "Synced" / "Syncing…" / "Sync" (tap to sign in again) / "Sync failed". */
export function initSyncButton() {
  const btn = h('button', { type: 'button', class: 'sync-btn', hidden: true });
  document.querySelector('.topbar-link').before(btn);
  btn.addEventListener('click', () => syncNow({ interactive: true }).catch(() => {}));
  onSyncStatus(s => {
    btn.hidden = s.state === 'off' || s.state === 'offline';
    btn.dataset.state = s.state;
    btn.disabled = s.state === 'syncing';
    btn.textContent = { idle: 'Synced', syncing: 'Syncing…', 'needs-auth': 'Sync', error: 'Sync failed' }[s.state] || '';
    btn.title = s.state === 'error' ? `${s.message} — tap to try again`
      : s.state === 'needs-auth' ? 'Tap to sign in to Google and sync'
      : s.state === 'syncing' ? (s.detail || 'Syncing with Google Drive')
      : `Synced with Google Drive ${since(s.lastSyncAt)} — tap to sync now`;
  });
}

/** The Google Drive panel on the Backup page. */
export async function renderSyncPanel() {
  const panel = h('section', { class: 'panel' }, h('h2', {}, 'Sync with Google Drive'));
  if (!isConfigured()) {
    panel.append(
      h('p', { class: 'hint' }, 'Sync isn’t set up for this copy of the app yet. It needs a Google client ID — see “Set up Google Drive sync” in the README.'));
    return panel;
  }
  const body = h('div', { class: 'sync-body' });
  panel.append(body);
  let unsubscribe = null;

  async function draw() {
    if (unsubscribe) unsubscribe();
    body.textContent = '';
    const account = await driveAccount();
    if (!account) {
      const err = h('p', { class: 'form-error', hidden: true });
      body.append(
        h('p', {}, 'Keep your phone and laptop in step: entries and photos are stored in an “SSD Journal” folder in your own Google Drive.'),
        h('p', { class: 'hint' }, 'The app can only see files it creates — not the rest of your Drive. Each device signs in once; Google asks again about once an hour while you use it.'),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: async e => {
          e.target.disabled = true; err.hidden = true;
          try { await connectDrive(); } catch (x) { err.textContent = x.message || String(x); err.hidden = false; }
          draw();
        } }, 'Connect Google Drive')),
        err);
      return;
    }
    const state = h('p', { role: 'status' });
    const onlyDrive = await photosOnlyInDrive();
    const dlBtn = h('button', { type: 'button', class: 'btn btn-quiet', hidden: !onlyDrive, onclick: () => syncNow({ interactive: true, downloadAll: true }).then(draw).catch(() => {}) },
      `Download all photos (${onlyDrive})`);
    body.append(
      h('p', {}, 'Connected as ', h('strong', {}, account.email || 'your Google account'), '.'),
      state,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => syncNow({ interactive: true }).catch(() => {}) }, 'Sync now'),
        dlBtn,
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: async () => {
          if (!confirm('Stop syncing on this device? Your journal stays on this device and in Google Drive.')) return;
          await disconnectDrive(); draw();
        } }, 'Disconnect')),
      onlyDrive ? h('p', { class: 'hint' }, `${onlyDrive} full-size ${onlyDrive === 1 ? 'photo is' : 'photos are'} only in Google Drive (thumbnails are here). They download when you open them — or all at once before going offline. Backups include only photos on this device.`) : '');
    unsubscribe = onSyncStatus(s => {
      state.textContent = s.state === 'syncing' ? (s.detail || 'Syncing…')
        : s.state === 'error' ? `Last sync failed: ${s.message}`
        : s.state === 'needs-auth' ? 'Signed out after an hour — tap Sync now to continue.'
        : s.state === 'offline' ? 'Offline — will sync when the network is back.'
        : `Last synced ${since(s.lastSyncAt)}.`;
      state.className = s.state === 'error' ? 'form-error' : 'hint';
    });
  }
  await draw();
  return panel;
}
