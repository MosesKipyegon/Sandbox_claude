// Google Drive access: sign-in (Google Identity Services) and the few Drive API calls sync needs.
// Scope drive.file: the app can only see and change files it created itself — never the rest of your Drive.
// Google's sign-in script is loaded only when Drive is used, never on a normal app start.
import { getMeta, setMeta } from './db.js';
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Automated tests point the app at a local fake Drive (localStorage "ssd-test-drive"); unused otherwise.
const TEST = (() => { try { return JSON.parse(localStorage.getItem('ssd-test-drive') || 'null'); } catch (e) { return null; } })();
const BASE = TEST ? TEST.base : 'https://www.googleapis.com';

export const isConfigured = () => !!(GOOGLE_CLIENT_ID || TEST);

export class AuthNeeded extends Error {
  constructor() { super('Tap Sync to sign in to Google again.'); this.name = 'AuthNeeded'; }
}

// ---------- Sign-in ----------
let gisPromise;
export function loadGoogleSignIn() {
  if (TEST) return Promise.resolve();
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return (gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new Error('Could not reach Google — check the connection.')); };
    document.head.append(s);
  }));
}

/**
 * Returns a valid access token. Tokens last about an hour; after that, interactive: true shows
 * Google's sign-in (it must be called from a tap). Without interactive, returns null if none is valid.
 */
export async function getToken({ interactive = false } = {}) {
  if (TEST) return TEST.token;
  const saved = await getMeta('driveToken');
  if (saved && saved.expiresAt > Date.now() + 60000) return saved.token;
  if (!interactive) return null;
  await loadGoogleSignIn();
  const firstTime = !(await getMeta('driveAccount'));
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: async resp => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        await setMeta('driveToken', { token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) - 60) * 1000 });
        resolve(resp.access_token);
      },
      error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Google sign-in was closed.' : 'Google sign-in did not complete' + (e && e.type ? ` (${e.type})` : '') + '.'))
    });
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '' });
  });
}

export async function signOut() {
  const saved = await getMeta('driveToken');
  if (!TEST && saved && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(saved.token, () => {}); } catch (e) { /* already gone */ }
  }
  await setMeta('driveToken', null);
}

// ---------- Drive API ----------
async function api(path, token, { method = 'GET', body, headers = {}, upload = false, as = 'json' } = {}) {
  const res = await fetch(BASE + (upload ? '/upload/drive/v3' : '/drive/v3') + path, {
    method, body, headers: { Authorization: 'Bearer ' + token, ...headers }
  });
  if (res.status === 401) { await setMeta('driveToken', null); throw new AuthNeeded(); }
  if (res.status === 404 && method === 'DELETE') return null;   // already gone
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error.message; } catch (e) { /* no details */ }
    throw new Error(`Google Drive error ${res.status}${msg ? ': ' + msg : ''}`);
  }
  if (res.status === 204 || as === 'none') return null;
  return as === 'blob' ? res.blob() : as === 'text' ? res.text() : res.json();
}

const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function whoAmI(token) {
  const r = await api('/about?fields=user(emailAddress,displayName)', token);
  return r.user || {};
}

/** All files in a folder: Map(name → id). */
export async function listFolder(token, folderId) {
  const out = new Map();
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${q(folderId)}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name)', pageSize: '1000', spaces: 'drive'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await api('/files?' + params, token);
    (r.files || []).forEach(f => out.set(f.name, f.id));
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Finds (or creates) a folder by name inside parentId ('root' = My Drive). */
export async function ensureFolder(token, name, parentId = 'root') {
  const params = new URLSearchParams({
    q: `name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and '${q(parentId)}' in parents and trashed = false`,
    fields: 'files(id)', spaces: 'drive'
  });
  const found = await api('/files?' + params, token);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await api('/files?fields=id', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
  });
  return made.id;
}

export function download(token, fileId, as = 'blob') {
  return api(`/files/${encodeURIComponent(fileId)}?alt=media`, token, { as });
}

/** Uploads a new file; returns its id. */
export async function uploadFile(token, name, parentId, blob, mime) {
  const boundary = 'ssd-' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parentId], mimeType: mime });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`
  ]);
  const r = await api('/files?uploadType=multipart&fields=id', token, {
    method: 'POST', upload: true, body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }
  });
  return r.id;
}

/** Replaces the content of an existing file. */
export function replaceFile(token, fileId, blob, mime) {
  return api(`/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`, token, {
    method: 'PATCH', upload: true, body: blob, headers: { 'Content-Type': mime }
  });
}

export function deleteFile(token, fileId) {
  return api(`/files/${encodeURIComponent(fileId)}`, token, { method: 'DELETE', as: 'none' });
}
