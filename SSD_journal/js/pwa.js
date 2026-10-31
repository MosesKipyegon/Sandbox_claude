// Offline/installable app glue: registers the service worker, offers updates and installation,
// and shows a small "Offline" label when there's no network.
import { h } from './dom.js';

export function initPwa() {
  const status = h('span', { class: 'net-status', hidden: navigator.onLine, title: 'No network — everything still works and is saved on this device' }, 'Offline');
  const installBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-small', hidden: true, title: 'Install SSD Journal as an app' }, 'Install');
  document.querySelector('.topbar-link').before(status, installBtn);

  const updateStatus = () => { status.hidden = navigator.onLine; };
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  // Android/desktop Chrome: offer our own Install button
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  if (!('serviceWorker' in navigator)) return;
  // Reload only when the user tapped Update — never when the service worker first takes control
  // (that happens on the very first visit, possibly while the app is still setting up).
  let updateRequested = false;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offerUpdate = worker => showUpdate(() => { updateRequested = true; worker.postMessage('SKIP_WAITING'); });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        // "installed" with an existing controller = a new version is waiting
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // Check for a new version when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* e.g. opened from file:// — the app still works, just not offline */ });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
}

function showUpdate(apply) {
  if (document.querySelector('.update-toast')) return;
  document.body.append(h('div', { class: 'update-toast', role: 'status' },
    h('span', {}, 'A new version is ready.'),
    h('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: apply }, 'Update')));
}
