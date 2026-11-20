const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());

if ('serviceWorker' in navigator) {
  if (isNativeApp) {
    // In der App liegen die Dateien schon lokal. Ein Service Worker würde
    // nach einem App-Update alte Dateien aus dem Cache liefern.
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations.map((registration) => registration.unregister())
      ))
      .then(() => ('caches' in window ? caches.keys() : []))
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .catch((error) => {
        console.warn('Alter Service Worker konnte nicht entfernt werden.', error);
      });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .catch((error) => {
          console.error('Service Worker konnte nicht registriert werden.', error);
        });
    });
  }
}
