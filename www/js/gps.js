const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const gpsStatus = document.querySelector("#gps-status");
const distanceCount = document.querySelector("#distance-count");
const areaCount = document.querySelector("#area-count");
const countryCount = document.querySelector("#country-count");
const levelCount = document.querySelector("#level-count");
const xpCount = document.querySelector("#xp-count");
const nextLevelXp = document.querySelector("#next-level-xp");
const levelProgressBar = document.querySelector("#level-progress-bar");
const currentPosition = document.querySelector("#current-position");
const gpsAccuracy = document.querySelector("#gps-accuracy");
const tourDuration = document.querySelector("#tour-duration");
const travelModeButtons = document.querySelectorAll(".mode-button");
const headerLevelProgressBar = document.querySelector("#header-level-progress-bar");

// Bei jeder Änderung erhöhen: In den Einstellungen sieht man so,
// ob das Gerät die neue Version geladen hat.
const appVersion = "1.2.0";
const appVersionElement = document.querySelector("#app-version");
if (appVersionElement) appVersionElement.textContent = `Version ${appVersion}`;

const discoveryRadius = 100;
const travelModeLabels = { walking: "zu Fuss", vehicle: "Fahrzeug" };

let gpsService = null;
let locationFilter = window.createLocationFilter();
let tourStartedAt = null;
let tourTimerId = null;
let centerOnNextLocation = false;
let hasLocation = false;
let lastStatusDetail = "";

function formatDistance(distance) {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distance)} m`;
}

function updateStatistics() {
  const statistics = window.getStatistics();
  distanceCount.textContent = formatDistance(statistics.distance);
  areaCount.textContent = String(statistics.areaCount);
  countryCount.textContent = String(statistics.countryCount);
  levelCount.textContent = String(statistics.exploration.level);
  xpCount.textContent = `${statistics.exploration.xp} XP`;
  nextLevelXp.textContent = `${statistics.exploration.nextLevelXp} XP`;
  levelProgressBar.style.width = `${statistics.exploration.percentage}%`;
  headerLevelProgressBar.style.width = `${statistics.exploration.percentage}%`;
  document.dispatchEvent(new CustomEvent("worldunlock:statistics-updated", {
    detail: statistics,
  }));
}

function setStatus(message) {
  gpsStatus.textContent = message;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

function updateTourDuration() {
  tourDuration.textContent = tourStartedAt
    ? formatDuration(Date.now() - tourStartedAt)
    : "00:00";
}

function updatePositionDetails(position, accuracy) {
  currentPosition.textContent = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
  updateAccuracy(accuracy);
}

function updateAccuracy(accuracy) {
  gpsAccuracy.textContent = Number.isFinite(accuracy) ? `${Math.round(accuracy)} m` : "-";
}

function showTravelMode(mode) {
  travelModeButtons.forEach((button) => {
    const isSelected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function trackingStatus(detail = "") {
  const mode = travelModeLabels[locationFilter.getMode()];
  return `GPS verbunden · ${mode}${detail}`;
}

// Land und Gemeinde für ein neu gespeichertes Gebiet nachschlagen.
async function assignPlace(area) {
  const place = await window.placeService.lookupPlace(area);
  window.updateAreaCountry(area, place);
  window.addVisitedCountry(place.name);
  if (place.municipality) {
    try {
      await window.lookupMunicipalityBoundary(place.municipality, place.code);
    } catch (error) {
      console.warn("Gemeindegrenze nicht verfügbar.", error);
    }
  }
}

function lookupCountry(area) {
  assignPlace(area)
    .then(updateStatistics)
    .catch((error) => {
      console.warn("Land konnte nicht ermittelt werden.", error);
    });
}

async function enrichExistingAreas() {
  const areas = window.getAreasWithoutCountry();
  for (const area of areas) {
    try {
      await assignPlace(area);
    } catch (error) {
      console.warn("Land konnte nicht ergänzt werden.", error);
      // Offline oder Dienst nicht erreichbar: später erneut versuchen.
      if (error instanceof TypeError) break;
    }
  }
  if (areas.length) updateStatistics();
}

async function enrichExistingMunicipalityBoundaries() {
  const municipalities = window.getMunicipalitiesWithoutBoundary();
  for (const municipality of municipalities) {
    try {
      await window.lookupMunicipalityBoundary(municipality, "CH");
    } catch (error) {
      console.warn("Gemeindegrenze konnte nicht ergänzt werden.", error);
      if (error instanceof TypeError) break;
    }
  }
  if (municipalities.length) updateStatistics();
}

function recordArea(record, accuracy, timestamp) {
  const area = window.saveDiscoveredArea({
    latitude: record.position.latitude,
    longitude: record.position.longitude,
    radius: discoveryRadius,
    ...(record.previous
      ? {
          startLatitude: record.previous.latitude,
          startLongitude: record.previous.longitude,
        }
      : {}),
  });
  if (area) {
    lookupCountry(area);
  }
  if (record.distance > 0) {
    window.addTravelledDistance(record.distance);
  }
  const explorationResult = window.explorationEngine.processLocation({
    latitude: record.position.latitude,
    longitude: record.position.longitude,
    accuracy,
    timestamp,
  });
  return { areaWasUnlocked: Boolean(area), explorationResult };
}

function updateLocation(fix) {
  const result = locationFilter.process(fix);

  if (result.type === "invalid" || result.type === "stale") {
    return;
  }
  if (result.type === "inaccurate") {
    updateAccuracy(result.accuracy);
    setStatus(hasLocation ? trackingStatus(" · Signal sehr ungenau") : "GPS-Signal wird gesucht …");
    return;
  }
  if (result.type === "outlier") {
    setStatus(trackingStatus(" · GPS-Sprung ignoriert"));
    return;
  }

  hasLocation = true;
  const coordinates = [result.position.latitude, result.position.longitude];

  // Die Anzeige folgt jeder gültigen Messung, auch wenn sie zu ungenau
  // zum Freischalten ist. Der Genauigkeitskreis zeigt die Unsicherheit.
  updatePositionDetails(result.position, result.accuracy);
  window.updateLocationAvatar(coordinates, window.getSelectedAvatar(), result.accuracy);
  showTravelMode(result.mode);

  if (centerOnNextLocation) {
    window.worldMap.setView(coordinates, Math.max(window.worldMap.getZoom(), 16));
    centerOnNextLocation = false;
  }

  if (!result.record) {
    setStatus(trackingStatus(
      result.accuracy > window.locationFilterSettings.maxRecordAccuracy
        ? " · zu ungenau zum Freischalten"
        : lastStatusDetail,
    ));
    return;
  }

  try {
    const { areaWasUnlocked, explorationResult } = recordArea(result.record, result.accuracy, fix.timestamp);
    const details = [];
    if (areaWasUnlocked) details.push("Neues Gebiet");
    if (explorationResult.status === "new") details.push(`+${explorationResult.xpAwarded} XP`);
    lastStatusDetail = details.length ? ` · ${details.join(" · ")}` : "";
    updateStatistics();
    setStatus(trackingStatus(lastStatusDetail));
  } catch (error) {
    console.error(error);
    setStatus(
      error?.name === "QuotaExceededError"
        ? "Speicher voll · Gebiet nicht gespeichert"
        : "Gebiet konnte nicht gespeichert werden.",
    );
  }
}

function showLocationError(error) {
  const errorMessages = {
    1: "Standortfreigabe wurde verweigert. Bitte in den Einstellungen erlauben.",
    2: "GPS-Standort ist momentan nicht verfügbar.",
    3: "GPS antwortet nicht · suche weiter …",
  };

  if (error.fatal) {
    stopTracking().then(() => setStatus(errorMessages[error.code] || "GPS-Fehler"));
    return;
  }
  setStatus(errorMessages[error.code] || "GPS-Fehler");
}

function resetTourState() {
  if (tourTimerId !== null) {
    window.clearInterval(tourTimerId);
  }
  tourTimerId = null;
  tourStartedAt = null;
  hasLocation = false;
  lastStatusDetail = "";
  locationFilter.reset();
  startButton.disabled = false;
  stopButton.disabled = true;
}

async function startTracking() {
  if (!gpsService) {
    gpsService = new window.GpsService({
      onLocation: updateLocation,
      onError: showLocationError,
    });
  }
  if (gpsService.isActive()) {
    return;
  }

  locationFilter.reset();
  hasLocation = false;
  lastStatusDetail = "";
  setStatus("GPS wird gesucht …");
  tourStartedAt = Date.now();
  centerOnNextLocation = true;
  updateTourDuration();
  tourTimerId = window.setInterval(updateTourDuration, 1000);
  startButton.disabled = true;
  stopButton.disabled = false;

  try {
    await gpsService.start();
  } catch (error) {
    console.error(error);
    await gpsService.stop().catch(() => {});
    resetTourState();
    updateTourDuration();
    setStatus(error.message || "GPS konnte nicht gestartet werden");
  }
}

async function stopTracking() {
  if (gpsService) {
    try {
      await gpsService.stop();
    } catch (error) {
      console.error(error);
    }
  }
  resetTourState();
  updateTourDuration();
  setStatus("Tour wurde gestoppt");
}

function clearLocationMarker() {
  window.clearLocationAvatar();
}

// Die Fortbewegungsart wird aus der Geschwindigkeit erkannt.
// Die Knöpfe zeigen nur an, was gerade erkannt wurde.
travelModeButtons.forEach((button) => {
  button.title = "Wird automatisch erkannt";
  button.addEventListener("click", () => {
    setStatus(
      gpsService?.isActive()
        ? trackingStatus(" · wird automatisch erkannt")
        : "Fortbewegung wird während der Tour automatisch erkannt",
    );
  });
});

document.addEventListener("worldunlock:avatar-selected", (event) => {
  window.updateLocationAvatar(null, event.detail);
});
startButton.addEventListener("click", startTracking);
stopButton.addEventListener("click", stopTracking);
window.updateStatistics = updateStatistics;
window.stopTracking = stopTracking;
window.clearLocationMarker = clearLocationMarker;

try {
  window.explorationEngine.load();
  window.loadDiscoveredAreas();
  updateStatistics();
  // Die UI-Module (Avatare, Profil, Erfolge …) werden erst nach dieser
  // Datei geladen und verpassen das erste Update. Nach dem Laden aller
  // Skripte nochmals senden, damit alles von Anfang an gezeichnet ist.
  document.addEventListener("DOMContentLoaded", updateStatistics, { once: true });
  setStatus("Bereit");
  enrichExistingAreas().then(enrichExistingMunicipalityBoundaries);
} catch (error) {
  console.error(error);
  setStatus("Gespeicherte Gebiete konnten nicht geladen werden.");
}
