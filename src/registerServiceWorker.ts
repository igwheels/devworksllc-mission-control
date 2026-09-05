// Registers public/sw.js in production only — a service worker in `vite dev`
// would fight HMR and cache half-built modules.
//
// Update strategy (DEV-69): the new worker calls skipWaiting()/clients.claim()
// immediately (see sw.js) instead of waiting for every tab to close, and the
// `controllerchange` listener below reloads the page the moment that new
// worker takes control — so an open tab adopts a new deploy on its own
// rather than needing a manual refresh. Combined with the periodic
// `registration.update()` call, a client checks for a new version at least
// once an hour even if it's a wall display that never navigates on its own
// (the browser's built-in background check can be as infrequent as ~daily).
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      setInterval(() => void registration.update(), 60 * 60 * 1000);
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
