// Entry cards for the feed and the place page.
// Photos load lazily: a card's images are read from storage only as it scrolls into view.
import { h, formatDates } from './dom.js';
import { get } from './db.js';
import { blobUrl } from './photos.js';
import { openViewer } from './viewer.js';
import { fetchFullPhoto } from './sync.js';

let observer = null;

function lazyObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(items => {
    items.forEach(item => {
      if (!item.isIntersecting) return;
      observer.unobserve(item.target);
      loadPhoto(item.target);
    });
  }, { rootMargin: '600px 0px' });  // start loading a little before the card is on screen
  return observer;
}

async function loadPhoto(img) {
  const p = await get('photos', img.dataset.photo);
  if (p && !p.deleted && (p.full || p.thumb)) {
    img.src = blobUrl(p.full || p.thumb);
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    // Synced from another device: show the thumbnail now, swap in the full photo from Drive
    if (!p.full) fetchFullPhoto(p.id).then(full => { if (full && img.isConnected) img.src = blobUrl(full); });
  } else {
    img.closest('.card-photo').classList.add('missing');
  }
}

/** Renders a list of entry cards into `container`. */
export function renderCards(container, entries, placeById, { showPlace = true, monthHeadings = false } = {}) {
  const obs = lazyObserver();
  let lastMonth = null;
  entries.forEach(entry => {
    // "March 2026" between cards, like turning the pages of a diary
    const month = (entry.dateFrom || '').slice(0, 7);
    if (monthHeadings && month && month !== lastMonth) {
      lastMonth = month;
      const [y, m] = month.split('-').map(Number);
      container.append(h('h2', { class: 'month' }, new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })));
    }
    const card = renderCard(entry, placeById.get(entry.placeId), { showPlace });
    container.append(card);
    card.querySelectorAll('img[data-photo]').forEach(img => obs.observe(img));
  });
}

function renderCard(entry, place = { name: 'Unknown place', state: '' }, { showPlace }) {
  const photoIds = entry.photoIds || [];
  const count = h('span', { class: 'photo-count', 'aria-hidden': 'true' }, photoIds.length > 1 ? `1 / ${photoIds.length}` : '');
  const track = h('div', { class: 'card-photos' },
    photoIds.map((pid, i) => h('button', {
      type: 'button', class: 'card-photo',
      'aria-label': `Open photo ${i + 1} of ${photoIds.length}`,
      onclick: () => openViewer(photoIds, i, place.name)
    }, h('img', { 'data-photo': pid, alt: `${place.name}, photo ${i + 1}` }))));
  if (photoIds.length > 1) {
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      count.textContent = `${i + 1} / ${photoIds.length}`;
    }, { passive: true });
  }

  const reason = entry.reason === 'Other' && entry.reasonOther ? entry.reasonOther : entry.reason;
  const meta = [formatDates(entry.dateFrom, entry.dateTo), reason, showPlace ? place.state : null].filter(Boolean).join(' · ');
  const section = (title, text) => text ? h('section', { class: 'card-section' }, h('h3', {}, title), h('p', {}, text)) : null;

  return h('article', { class: 'card' + (photoIds.length ? '' : ' card-nophoto') },
    photoIds.length ? h('div', { class: 'card-media' }, track, count) : null,
    h('div', { class: 'card-body' },
      h('header', { class: 'card-head' },
        h('div', {},
          showPlace ? h('a', { class: 'card-place', href: `#/place/${place.id}` }, place.name)
                    : h('span', { class: 'card-place' }, formatDates(entry.dateFrom, entry.dateTo)),
          h('p', { class: 'card-meta' }, showPlace ? meta : [reason].filter(Boolean).join(''))),
        h('a', { class: 'card-edit', href: `#/edit/${entry.id}` }, 'Edit')),
      entry.sample ? h('span', { class: 'badge' }, 'Sample') : null,
      entry.caption ? h('p', { class: 'card-caption' }, entry.caption) : null,
      entry.rating ? h('p', { class: 'card-rating', 'aria-label': `Rated ${entry.rating} of 5` },
        h('span', { class: 'on' }, '★'.repeat(entry.rating)), h('span', { class: 'off' }, '★'.repeat(5 - entry.rating))) : null,
      section('What I actually think', entry.thoughts),
      section('Food I enjoyed', entry.food),
      section('Didn’t expect to find', entry.unexpected)));
}
