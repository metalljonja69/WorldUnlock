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
const countryProgressBar = document.querySelector("#country-progress-bar");
const countriesEmpty = document.querySelector("#countries-empty");
const countrySelect = document.querySelector("#country-select");
const countryProgress = document.querySelector("#country-progress");
const travelModeButtons = document.querySelectorAll(".mode-button");
const achievementList = document.querySelector("#achievement-list");
const avatarGrid = document.querySelector("#avatar-grid");
const avatarProgress = document.querySelector("#avatar-progress");
const headerLevelProgressBar = document.querySelector("#header-level-progress-bar");

let gpsService = null;
let locationMarker = null;
let lastPosition = null;
let smoothedPosition = null;
let lastSampleTime = null;
let travelMode = "walking";
let tourStartedAt = null;
let tourTimerId = null;
let centerOnNextLocation = false;
const discoveryRadius = 100;
const sampleIntervals = {
  walking: 10000,
  vehicle: 2000,
};

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
  countriesEmpty.hidden = statistics.countries.length > 0;
  const selectedCountry = countrySelect.value;
  countrySelect.replaceChildren(
    ...statistics.countries.map((countryName) => {
      const countryOption = document.createElement("option");
      countryOption.value = countryName;
      countryOption.textContent = countryName;
      return countryOption;
    }),
  );
  countrySelect.disabled = statistics.countries.length === 0;
  if (statistics.countries.includes(selectedCountry)) {
    countrySelect.value = selectedCountry;
  }
  updateCountryProgress();
  updateAchievements();
  updateAvatarOptions();
}

function updateCountryProgress() {
  const selectedCountry = window
    .getStatistics()
    .countryProgress.find((country) => country.name === countrySelect.value);
  countryProgress.textContent = selectedCountry
    ? `${selectedCountry.percentage.toFixed(2)} % freigeschaltet`
    : "0 % freigeschaltet";
  countryProgressBar.style.width = `${selectedCountry ? selectedCountry.percentage : 0}%`;
}

function updateAchievements() {
  const municipalities = window.getStatistics().municipalities;
  achievementList.replaceChildren(
    ...(municipalities.length
      ? municipalities.map((municipality) => {
          const item = document.createElement("li");
          item.textContent = `${municipality.name}: ${municipality.percentage.toFixed(2)} % erfasst`;
          return item;
        })
      : [Object.assign(document.createElement("li"), {
          textContent: "Noch keine Gemeinde erfasst.",
        })]),
  );
}

function updateAvatarOptions() {
  const definitions = window.getAvatarDefinitions();
  const selectedAvatar = window.getSelectedAvatar();
  avatarGrid.replaceChildren(
    ...definitions.map((avatar) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "avatar-choice";
      button.disabled = !avatar.unlocked;
      button.dataset.avatarId = avatar.id;
      button.setAttribute("aria-label", avatar.unlocked ? avatar.label : `${avatar.label}, gesperrt`);
      button.setAttribute("aria-pressed", String(avatar.id === selectedAvatar.id));
      button.innerHTML = `${avatar.svg}<span>${avatar.label}</span>`;
      return button;
    }),
  );
  const travelledDistance = window.getStatistics().distance;
  avatarProgress.textContent = definitions
    .filter((avatar) => !avatar.unlocked)
    .map((avatar) => `${avatar.label}: ${formatDistance(Math.max(0, avatar.requiredDistance - travelledDistance))}`)
    .join(" · ") || "Alle Avatare freigeschaltet.";
  if (locationMarker) {
    window.updateLocationAvatar(locationMarker.getLatLng(), selectedAvatar);
  }
}

function setStatus(message) {
  gpsStatus.textContent = message;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function updateTourDuration() {
  tourDuration.textContent = tourStartedAt
    ? formatDuration(Date.now() - tourStartedAt)
    : "00:00";
}

function updatePositionDetails(position) {
  currentPosition.textContent = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
  gpsAccuracy.textContent = `${Math.round(position.accuracy)} m`;
}

function calculateDistance(firstPosition, secondPosition) {
  const earthRadius = 6371000;
  const latitudeDifference =
    ((secondPosition.latitude - firstPosition.latitude) * Math.PI) / 180;
  const longitudeDifference =
    ((secondPosition.longitude - firstPosition.longitude) * Math.PI) / 180;
  const firstLatitude = (firstPosition.latitude * Math.PI) / 180;
  const secondLatitude = (secondPosition.latitude * Math.PI) / 180;

  const distance =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadius * 2 * Math.atan2(Math.sqrt(distance), Math.sqrt(1 - distance))
  );
}

function unlockArea(position, previousPosition) {
  const areaWasSaved = window.saveDiscoveredArea({
    latitude: position.latitude,
    longitude: position.longitude,
    radius: discoveryRadius,
    ...(previousPosition
      ? {
          startLatitude: previousPosition.latitude,
          startLongitude: previousPosition.longitude,
        }
      : {}),
  });
  if (areaWasSaved) {
    lookupCountry(position);
  }
  return areaWasSaved;
}

async function lookupCountry(position) {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.latitude}&longitude=${position.longitude}&localityLanguage=de`,
    );

    if (!response.ok) {
      throw new Error(`Reverse-Geocoding fehlgeschlagen: ${response.status}`);
    }

    const place = await response.json();

    if (!place.countryName || !place.countryCode) {
      throw new Error("Reverse-Geocoding lieferte kein Land.");
    }

    const countryResponse = await fetch(
      `https://api.worldbank.org/v2/country/${place.countryCode}/indicator/AG.LND.TOTL.K2?format=json&date=2023`,
    );

    if (!countryResponse.ok) {
      throw new Error(
        `Länderfläche konnte nicht geladen werden: ${countryResponse.status}`,
      );
    }

    const countryData = await countryResponse.json();
    const countryArea = countryData[1]?.[0]?.value;

    if (!Number.isFinite(countryArea) || countryArea <= 0) {
      throw new Error("Länderfläche hat ein ungültiges Format.");
    }

    let municipalityBoundary = null;
    try {
      municipalityBoundary = await window.lookupMunicipalityBoundary(
        place.locality || place.city || place.principalSubdivision,
      );
    } catch (boundaryError) {
      console.warn("Gemeindegrenze nicht verfügbar.", boundaryError);
    }

    window.updateAreaCountry(position, {
      name: place.countryName,
      code: place.countryCode,
      area: countryArea,
      municipality: place.locality || place.city || place.principalSubdivision,
      municipalityArea: municipalityBoundary?.area,
      municipalityPolygon: municipalityBoundary?.polygon,
    });
    window.addVisitedCountry(place.countryName);
    updateStatistics();
  } catch (error) {
    console.error(error);
    setStatus("Land konnte nicht ermittelt werden.");
  }
}

async function enrichExistingAreas() {
  const areas = window.getAreasWithoutCountry();

  for (const area of areas) {
    await lookupCountry(area);
  }
}

async function enrichExistingMunicipalityBoundaries() {
  const municipalities = window.getMunicipalitiesWithoutBoundary();
  for (const municipality of municipalities) {
    try {
      const boundary = await window.lookupMunicipalityBoundary(municipality);
      window.addMunicipalityBoundary(municipality, boundary);
    } catch (error) {
      console.warn("Gemeindegrenze konnte nicht ergänzt werden.", error);
    }
  }
  updateStatistics();
}

countrySelect.addEventListener("change", updateCountryProgress);

function updateLocation(position) {
  if (
    !Number.isFinite(position.coords.accuracy) ||
    position.coords.accuracy > 25
  ) {
    setStatus("GPS-Signal ungenau");
    gpsAccuracy.textContent = `${Math.round(position.coords.accuracy)} m`;
    return;
  }

  const rawPosition = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    timestamp: Number.isFinite(position.timestamp)
      ? position.timestamp
      : Date.now(),
  };
  smoothedPosition = smoothedPosition
    ? {
        latitude: smoothedPosition.latitude * 0.65 + rawPosition.latitude * 0.35,
        longitude: smoothedPosition.longitude * 0.65 + rawPosition.longitude * 0.35,
        timestamp: rawPosition.timestamp,
      }
    : rawPosition;
  const currentPosition = smoothedPosition;

  if (Number.isFinite(position.coords.speed) && position.coords.speed > 100) {
    setStatus("Unplausible GPS-Geschwindigkeit ignoriert");
    return;
  }

  if (
    lastSampleTime !== null &&
    currentPosition.timestamp - lastSampleTime <
      sampleIntervals[travelMode]
  ) {
    return;
  }

  let distanceFromLastPosition = 0;

  if (lastPosition) {
    distanceFromLastPosition = calculateDistance(lastPosition, currentPosition);
    if (distanceFromLastPosition < 3) {
      updatePositionDetails({
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        accuracy: position.coords.accuracy,
      });
      setStatus("GPS verbunden · kleine Abweichung geglättet.");
      return;
    }
    const timeInSeconds =
      (currentPosition.timestamp - lastPosition.timestamp) / 1000;

    if (
      timeInSeconds > 0 &&
      distanceFromLastPosition / timeInSeconds > 100
    ) {
      setStatus("Unrealistischer GPS-Sprung ignoriert.");
      return;
    }
  }

  const previousPosition = lastPosition;
  lastPosition = currentPosition;
  lastSampleTime = currentPosition.timestamp;
  const coordinates = [currentPosition.latitude, currentPosition.longitude];
  updatePositionDetails({
    latitude: currentPosition.latitude,
    longitude: currentPosition.longitude,
    accuracy: position.coords.accuracy,
  });

  const selectedAvatar = window.getSelectedAvatar();
  if (!locationMarker) {
    locationMarker = L.marker(coordinates);
  } else {
    locationMarker.setLatLng(coordinates);
  }
  window.updateLocationAvatar(
    coordinates,
    selectedAvatar,
    position.coords.accuracy,
  );

  let areaWasUnlocked;
  const explorationResult = window.explorationEngine.processLocation({
    latitude: currentPosition.latitude,
    longitude: currentPosition.longitude,
    accuracy: position.coords.accuracy,
    timestamp: currentPosition.timestamp,
    speed: position.coords.speed ?? null,
  });

  try {
    areaWasUnlocked = unlockArea(currentPosition, previousPosition);
    if (distanceFromLastPosition > 0) {
      window.addTravelledDistance(distanceFromLastPosition);
    }
    updateStatistics();
  } catch (error) {
    console.error(error);
    setStatus("Gebiet konnte nicht gespeichert werden.");
    return;
  }

  if (centerOnNextLocation) {
    window.worldMap.setView(coordinates, 16);
    centerOnNextLocation = false;
  }
  const discoveryMessage = areaWasUnlocked
    ? " Neues Gebiet freigeschaltet."
    : "";
  const xpMessage = explorationResult.status === "new"
    ? ` +${explorationResult.xpAwarded} XP.`
    : "";
  setStatus(
    `GPS verbunden · Tour läuft${discoveryMessage}${xpMessage}`,
  );
}

function showLocationError(error) {
  const errorMessages = {
    1: "Standortfreigabe wurde verweigert.",
    2: "GPS-Standort ist momentan nicht verfügbar.",
    3: "Die GPS-Anfrage hat zu lange gedauert.",
  };

  setStatus(errorMessages[error.code] || "GPS-Fehler");
}

function startTracking() {
  if (!gpsService) {
    gpsService = new window.GpsService({
      onLocation: updateLocation,
      onError: showLocationError,
    });
  }
  if (gpsService.isActive()) {
    return;
  }

  setStatus("GPS wird gesucht");
  tourStartedAt = Date.now();
  centerOnNextLocation = true;
  updateTourDuration();
  tourTimerId = window.setInterval(updateTourDuration, 1000);
  startButton.disabled = true;
  stopButton.disabled = false;
  gpsService
    .start(sampleIntervals[travelMode])
    .catch((error) => {
      console.error(error);
      stopTracking();
      setStatus(error.message || "GPS konnte nicht gestartet werden");
    });
}

async function stopTracking() {
  if (!gpsService || !gpsService.isActive()) {
    setStatus("Tour wurde gestoppt");
    return;
  }

  try {
    await gpsService.stop();
  } catch (error) {
    console.error(error);
    setStatus("GPS konnte nicht beendet werden");
  }

  if (tourTimerId !== null) {
    window.clearInterval(tourTimerId);
  }
  tourTimerId = null;
  tourStartedAt = null;
  lastPosition = null;
  smoothedPosition = null;
  lastSampleTime = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("Tour wurde gestoppt");
}

function clearLocationMarker() {
  if (locationMarker) {
    window.worldMap.removeLayer(locationMarker);
    locationMarker = null;
  }
  window.clearLocationAvatar();
}

travelModeButtons.forEach((button) => button.addEventListener("click", () => {
  travelMode = button.dataset.mode;
  travelModeButtons.forEach((modeButton) => {
    const isSelected = modeButton === button;
    modeButton.classList.toggle("is-selected", isSelected);
    modeButton.setAttribute("aria-pressed", String(isSelected));
  });
  if (gpsService && gpsService.isActive()) {
    stopTracking().then(startTracking);
    return;
  }
  setStatus(
    `Bereit · Messung alle ${sampleIntervals[travelMode] / 1000} Sekunden`,
  );
}));
avatarGrid.addEventListener("click", (event) => {
  const avatarButton = event.target.closest(".avatar-choice");
  if (!avatarButton) {
    return;
  }
  try {
    window.setSelectedAvatar(avatarButton.dataset.avatarId);
    updateAvatarOptions();
  } catch (error) {
    console.error(error);
    setStatus("Dieser Avatar ist noch nicht freigeschaltet.");
  }
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
  setStatus("Bereit");
  enrichExistingAreas();
  enrichExistingMunicipalityBoundaries();
} catch (error) {
  console.error(error);
  setStatus("Gespeicherte Gebiete konnten nicht geladen werden.");
}
