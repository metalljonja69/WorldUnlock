const gpsStates = Object.freeze({
  idle: "idle",
  starting: "starting",
  tracking: "tracking",
  stopping: "stopping",
  error: "error",
});

/**
 * Liefert Standorte als einheitliches Objekt:
 * { latitude, longitude, accuracy, speed, timestamp }
 *
 * In der nativen App wird das Background-Geolocation-Plugin genutzt,
 * im Browser navigator.geolocation.watchPosition (laufende Verfolgung
 * statt wiederholter Einzelabfragen, die das GPS jedes Mal neu starten).
 */
class GpsService {
  constructor({ onLocation, onError }) {
    this.onLocation = onLocation;
    this.onError = onError;
    this.state = gpsStates.idle;
    this.watcherId = null;
    this.browserWatchId = null;
    this.wakeLock = null;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  getPlugin() {
    if (!window.Capacitor?.isNativePlatform?.()) {
      return null;
    }
    return window.Capacitor?.Plugins?.BackgroundGeolocation || null;
  }

  isActive() {
    return this.state === gpsStates.starting || this.state === gpsStates.tracking;
  }

  emitLocation(location) {
    if (!this.isActive()) {
      return;
    }
    this.onLocation(location);
  }

  emitError(error) {
    if (!this.isActive()) {
      return;
    }
    this.onError(error);
  }

  async start() {
    if (this.isActive()) {
      return;
    }

    const plugin = this.getPlugin();

    if (!plugin) {
      if (
        window.isSecureContext === false &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname)
      ) {
        throw new Error("Standortzugriff benötigt HTTPS.");
      }
      if (!navigator.geolocation) {
        throw new Error("GPS wird von diesem Browser nicht unterstützt.");
      }
    }

    this.state = gpsStates.starting;

    try {
      if (plugin) {
        await this.startPlugin(plugin);
      } else {
        this.startBrowser();
      }
    } catch (error) {
      this.state = gpsStates.error;
      throw error;
    }

    if (this.state === gpsStates.starting) {
      this.state = gpsStates.tracking;
    }
  }

  async startPlugin(plugin) {
    const watcherId = await plugin.addWatcher(
      {
        backgroundMessage: "WorldUnlock zeichnet deinen Weg auf.",
        backgroundTitle: "WorldUnlock verwendet deinen Standort",
        requestPermissions: true,
        stale: false,
        distanceFilter: 2,
      },
      (location, error) => {
        if (error) {
          this.emitError({
            code: error.code === "NOT_AUTHORIZED" ? 1 : 2,
            fatal: error.code === "NOT_AUTHORIZED",
            message: error.message,
          });
          return;
        }
        if (!location) {
          return;
        }
        this.emitLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: location.speed,
          timestamp: location.time,
        });
      },
    );
    // Wurde während des Starts gestoppt (z. B. Freigabe verweigert)?
    if (this.state !== gpsStates.starting) {
      await plugin.removeWatcher({ id: watcherId });
      return;
    }
    this.watcherId = watcherId;
  }

  startBrowser() {
    this.browserWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.emitLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        this.emitError({
          code: error.code,
          // Verweigerte Freigabe ist endgültig, Timeouts und kurze
          // Aussetzer nicht: watchPosition läuft danach weiter.
          fatal: error.code === 1,
          message: error.message,
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      },
    );
    this.requestWakeLock();
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  // Im Browser stoppt das GPS, sobald der Bildschirm ausgeht.
  // Ein Wake-Lock hält den Bildschirm während der Tour an.
  async requestWakeLock() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") {
      return;
    }
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
    } catch (error) {
      console.warn("Bildschirm-Sperre konnte nicht verhindert werden.", error);
    }
  }

  handleVisibilityChange() {
    if (document.visibilityState === "visible" && this.isActive() && !this.wakeLock) {
      this.requestWakeLock();
    }
  }

  async stop() {
    if (this.state === gpsStates.idle) {
      return;
    }

    this.state = gpsStates.stopping;

    if (this.browserWatchId !== null) {
      navigator.geolocation.clearWatch(this.browserWatchId);
      this.browserWatchId = null;
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }

    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (error) {
        console.warn("Wake-Lock konnte nicht freigegeben werden.", error);
      }
      this.wakeLock = null;
    }

    if (this.watcherId !== null) {
      const plugin = this.getPlugin();
      const watcherId = this.watcherId;
      this.watcherId = null;
      if (plugin) {
        await plugin.removeWatcher({ id: watcherId });
      }
    }

    this.state = gpsStates.idle;
  }
}

window.GpsService = GpsService;
window.gpsStates = gpsStates;
