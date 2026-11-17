const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const gpsStatus = document.querySelector("#gps-status");
const distanceCount = document.querySelector("#distance-count");
const countriesEmpty = document.querySelector("#countries-empty");
const countrySelect = document.querySelector("#country-select");
const countryProgress = document.querySelector("#country-progress");

let sampleTimerId = null;
let backgroundWatcherId = null;
let locationMarker = null;
let lastPosition = null;
let lastSampleTime = null;
const discoveryRadius = 50;
const sampleInterval = 15000;

function formatDistance(distance) {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distance)} m`;
}

function updateStatistics() {
  const statistics = window.getStatistics();
  distanceCount.textContent = formatDistance(statistics.distance);
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
}

function updateCountryProgress() {
  const selectedCountry = window
    .getStatistics()
    .countryProgress.find((country) => country.name === countrySelect.value);
  countryProgress.textContent = selectedCountry
    ? `${selectedCountry.percentage.toFixed(2)} % freigeschaltet`
    : "0 % freigeschaltet";
}

function setStatus(message) {
  gpsStatus.textContent = message;
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

function getBackgroundGeolocation() {
  if (!window.Capacitor || !window.Capacitor.Plugins) {
    return null;
  }

  return window.Capacitor.Plugins.BackgroundGeolocation || null;
}

function updateBackgroundLocation(location, error) {
  if (error) {
    console.error(error);
    showLocationError({ code: error.code === "NOT_AUTHORIZED" ? 1 : 2 });
    return;
  }

  if (!location) {
    return;
  }

  updateLocation({
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    },
    timestamp: location.time,
  });
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

    window.updateAreaCountry(position, {
      name: place.countryName,
      code: place.countryCode,
      area: countryArea,
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

countrySelect.addEventListener("change", updateCountryProgress);

function updateLocation(position) {
  if (position.coords.accuracy > 100) {
    setStatus("GPS-Signal ist zu ungenau. Warte auf ein besseres Signal.");
    return;
  }

  const currentPosition = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    timestamp: Number.isFinite(position.timestamp)
      ? position.timestamp
      : Date.now(),
  };

  if (
    lastSampleTime !== null &&
    currentPosition.timestamp - lastSampleTime < sampleInterval
  ) {
    return;
  }

  let distanceFromLastPosition = 0;

  if (lastPosition) {
    distanceFromLastPosition = calculateDistance(lastPosition, currentPosition);
    const timeInSeconds =
      (currentPosition.timestamp - lastPosition.timestamp) / 1000;

    if (
      timeInSeconds > 0 &&
      distanceFromLastPosition > 1000 &&
      timeInSeconds < 10
    ) {
      setStatus("Unrealistischer GPS-Sprung ignoriert.");
      return;
    }
  }

  const previousPosition = lastPosition;
  lastPosition = currentPosition;
  lastSampleTime = currentPosition.timestamp;
  const coordinates = [currentPosition.latitude, currentPosition.longitude];

  if (!locationMarker) {
    locationMarker = L.circleMarker(coordinates, {
      radius: 5,
      color: "#2c2c2cec",
      weight: 2,
      fillColor: "#0df009ec",
      fillOpacity: 1,
    }).addTo(window.worldMap);
  } else {
    locationMarker.setLatLng(coordinates);
  }

  let areaWasUnlocked;

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

  window.worldMap.setView(coordinates, 16);
  const discoveryMessage = areaWasUnlocked
    ? " Neues Gebiet freigeschaltet."
    : "";
  setStatus(
    `GPS aktiv. Genauigkeit: ungefähr ${Math.round(position.coords.accuracy)} m.${discoveryMessage}`,
  );
}

function showLocationError(error) {
  const errorMessages = {
    1: "Standortfreigabe wurde verweigert.",
    2: "GPS-Standort ist momentan nicht verfügbar.",
    3: "Die GPS-Anfrage hat zu lange gedauert.",
  };

  setStatus(errorMessages[error.code] || "Unbekannter GPS-Fehler.");
}

function startTracking() {
  if (!navigator.geolocation) {
    setStatus("Dieser Browser unterstützt keine Standortbestimmung.");
    return;
  }

  if (sampleTimerId !== null || backgroundWatcherId !== null) {
    return;
  }

  setStatus("GPS wird gestartet ...");

  const backgroundGeolocation = getBackgroundGeolocation();

  if (backgroundGeolocation) {
    backgroundGeolocation
      .addWatcher(
        {
          backgroundMessage: "WorldUnlock zeichnet deinen Weg auf.",
          backgroundTitle: "WorldUnlock verwendet deinen Standort",
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        updateBackgroundLocation,
      )
      .then((watcherId) => {
        backgroundWatcherId = watcherId;
        startButton.disabled = true;
        stopButton.disabled = false;
        setStatus("GPS aktiv. Hintergrundaufzeichnung ist eingeschaltet.");
      })
      .catch((error) => {
        console.error(error);
        setStatus("Hintergrund-GPS konnte nicht gestartet werden.");
      });
    return;
  }

  const locationOptions = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  };
  const requestLocation = () =>
    navigator.geolocation.getCurrentPosition(
      updateLocation,
      showLocationError,
      locationOptions,
    );

  requestLocation();
  sampleTimerId = window.setInterval(requestLocation, sampleInterval);
  startButton.disabled = true;
  stopButton.disabled = false;
}

function stopTracking() {
  if (sampleTimerId === null && backgroundWatcherId === null) {
    return;
  }

  const backgroundGeolocation = getBackgroundGeolocation();

  if (backgroundWatcherId !== null && backgroundGeolocation) {
    backgroundGeolocation
      .removeWatcher({ id: backgroundWatcherId })
      .catch((error) => {
        console.error(error);
        setStatus("Hintergrund-GPS konnte nicht beendet werden.");
      });
    backgroundWatcherId = null;
  }

  if (sampleTimerId !== null) {
    window.clearInterval(sampleTimerId);
  }

  sampleTimerId = null;
  lastPosition = null;
  lastSampleTime = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("GPS ist nicht aktiv.");
}

function clearLocationMarker() {
  if (locationMarker) {
    window.worldMap.removeLayer(locationMarker);
    locationMarker = null;
  }
}

startButton.addEventListener("click", startTracking);
stopButton.addEventListener("click", stopTracking);
window.updateStatistics = updateStatistics;
window.stopTracking = stopTracking;
window.clearLocationMarker = clearLocationMarker;

try {
  window.loadDiscoveredAreas();
  updateStatistics();
  enrichExistingAreas();
} catch (error) {
  console.error(error);
  setStatus("Gespeicherte Gebiete konnten nicht geladen werden.");
}
