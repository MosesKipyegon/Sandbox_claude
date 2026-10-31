// Full-screen photo viewer: swipe (or arrow keys) between an entry's photos, uncropped.
import { h } from './dom.js';
import { get } from './db.js';
import { blobUrl } from './photos.js';
import { fetchFullPhoto } from './sync.js';

let dialog;

export async function openViewer(photoIds, start, title) {
  if (!dialog) {
    dialog = h('dialog', { class: 'viewer', 'aria-label': 'Photo viewer' });
    document.body.append(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  }
  const counter = h('span', { class: 'viewer-count' });
  const track = h('div', { class: 'viewer-track' });
  const update = () => { counter.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1} / ${photoIds.length}`; };
  const step = d => track.scrollBy({ left: d * track.clientWidth, behavior: 'smooth' });

  for (const pid of photoIds) {
    const p = await get('photos', pid);
    const src = p && (p.full || p.thumb);
    const img = src ? h('img', { src: blobUrl(src), alt: title }) : null;
    track.append(h('figure', { class: 'viewer-slide' }, img || h('p', {}, 'Photo not available on this device yet.')));
    if (img && !p.full) fetchFullPhoto(pid).then(full => { if (full) img.src = blobUrl(full); });
  }
  track.addEventListener('scroll', update, { passive: true });

  dialog.textContent = '';
  dialog.append(
    track,
    h('div', { class: 'viewer-bar' },
      h('span', { class: 'viewer-title' }, title),
      photoIds.length > 1 ? counter : null,
      h('button', { type: 'button', class: 'viewer-close', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    photoIds.length > 1 ? h('button', { type: 'button', class: 'viewer-nav prev', 'aria-label': 'Previous photo', onclick: () => step(-1) }, '‹') : null,
    photoIds.length > 1 ? h('button', { type: 'button', class: 'viewer-nav next', 'aria-label': 'Next photo', onclick: () => step(1) }, '›') : null
  );
  dialog.onkeydown = e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
  dialog.showModal();
  track.scrollLeft = start * track.clientWidth;
  update();
}
