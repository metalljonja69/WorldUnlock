const gpsStates = Object.freeze({
  idle: "idle",
  requesting: "requesting",
  starting: "starting",
  tracking: "tracking",
  paused: "paused",
  stopping: "stopping",
  error: "error",
});

class GpsService {
  constructor({ onLocation, onError }) {
    this.onLocation = onLocation;
    this.onError = onError;
    this.state = gpsStates.idle;
    this.timerId = null;
    this.watcherId = null;
  }

  getPlugin() {
    return window.Capacitor?.Plugins?.BackgroundGeolocation || null;
  }

  isActive() {
    return this.state !== gpsStates.idle && this.state !== gpsStates.error;
  }

  async start(interval) {
    if (this.isActive()) {
      return;
    }

    if (
      window.isSecureContext === false &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      throw new Error("Standortzugriff benötigt HTTPS.");
    }

    if (!navigator.geolocation) {
      throw new Error("GPS wird von diesem Browser nicht unterstützt.");
    }

    this.state = gpsStates.requesting;
    const plugin = this.getPlugin();
    const locationOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };
    const requestLocation = () =>
      navigator.geolocation.getCurrentPosition(
        this.onLocation,
        this.onError,
        locationOptions,
      );

    this.state = gpsStates.starting;
    if (plugin) {
      const handlePluginLocation = (location, error) => {
        if (error) {
          this.onError({
            code: error.code === "NOT_AUTHORIZED" ? 1 : 2,
          });
          return;
        }
        if (!location) {
          return;
        }
        this.onLocation({
          coords: {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            speed: location.speed,
          },
          timestamp: location.time,
        });
      };
      this.watcherId = await plugin.addWatcher(
        {
          backgroundMessage: "WorldUnlock zeichnet deinen Weg auf.",
          backgroundTitle: "WorldUnlock verwendet deinen Standort",
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        handlePluginLocation,
      );
    } else {
      requestLocation();
      this.timerId = window.setInterval(requestLocation, interval);
    }

    this.state = gpsStates.tracking;
  }

  async stop() {
    if (!this.isActive()) {
      this.state = gpsStates.idle;
      return;
    }

    this.state = gpsStates.stopping;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.watcherId !== null) {
      const plugin = this.getPlugin();
      if (plugin) {
        await plugin.removeWatcher({ id: this.watcherId });
      }
      this.watcherId = null;
    }

    this.state = gpsStates.idle;
  }
}

window.GpsService = GpsService;
window.gpsStates = gpsStates;
