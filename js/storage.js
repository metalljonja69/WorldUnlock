const storageKey = "worldUnlockedAreas";
const distanceStorageKey = "worldUnlockedDistance";
const countriesStorageKey = "worldUnlockedCountries";
let discoveredAreas = [];
let travelledDistance = 0;
let visitedCountries = [];

function calculateDistance(firstArea, secondArea) {
  const earthRadius = 6371000;
  const latitudeDifference =
    ((secondArea.latitude - firstArea.latitude) * Math.PI) / 180;
  const longitudeDifference =
    ((secondArea.longitude - firstArea.longitude) * Math.PI) / 180;
  const firstLatitude = (firstArea.latitude * Math.PI) / 180;
  const secondLatitude = (secondArea.latitude * Math.PI) / 180;

  const distance =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadius * 2 * Math.atan2(Math.sqrt(distance), Math.sqrt(1 - distance))
  );
}

function drawDiscoveredArea(area) {
  const areaLayer = L.circle([area.latitude, area.longitude], {
    radius: area.radius,
    color: "#8d8d8d",
    weight: 3,
    fillOpacity: 0,
  }).addTo(window.worldMap);
  window.registerDiscoveredAreaLayer(areaLayer);
  window.addFogArea(area);
}

function isValidArea(area) {
  return (
    Number.isFinite(area.latitude) &&
    Number.isFinite(area.longitude) &&
    Number.isFinite(area.radius) &&
    area.radius > 0 &&
    (area.countryName === undefined || typeof area.countryName === "string") &&
    (area.countryCode === undefined || typeof area.countryCode === "string") &&
    (area.countryArea === undefined ||
      (Number.isFinite(area.countryArea) && area.countryArea > 0))
  );
}

function updateAreaCountry(position, country) {
  const area = discoveredAreas.find(
    (savedArea) =>
      calculateDistance(savedArea, position) <= savedArea.radius,
  );

  if (!area) {
    throw new Error("Das erkundete Gebiet konnte keinem Land zugeordnet werden.");
  }

  area.countryName = country.name;
  area.countryCode = country.code;
  area.countryArea = country.area;
  localStorage.setItem(storageKey, JSON.stringify(discoveredAreas));
}

function getAreasWithoutCountry() {
  return discoveredAreas
    .filter((area) => !area.countryName)
    .map((area) => ({
      latitude: area.latitude,
      longitude: area.longitude,
    }));
}

function loadDiscoveredAreas() {
  const savedAreas = localStorage.getItem(storageKey);

  if (savedAreas) {
    const parsedAreas = JSON.parse(savedAreas);

    if (!Array.isArray(parsedAreas) || !parsedAreas.every(isValidArea)) {
      throw new Error("Gespeicherte Gebiete haben ein ungültiges Format.");
    }

    discoveredAreas = parsedAreas;
    discoveredAreas.forEach(drawDiscoveredArea);
  }

  const savedDistance = localStorage.getItem(distanceStorageKey);

  if (savedDistance) {
    const parsedDistance = Number(savedDistance);

    if (!Number.isFinite(parsedDistance) || parsedDistance < 0) {
      throw new Error("Gespeicherte Distanz hat ein ungültiges Format.");
    }

    travelledDistance = parsedDistance;
  }

  const savedCountries = localStorage.getItem(countriesStorageKey);

  if (savedCountries) {
    const parsedCountries = JSON.parse(savedCountries);

    if (
      !Array.isArray(parsedCountries) ||
      !parsedCountries.every((country) => typeof country === "string" && country)
    ) {
      throw new Error("Gespeicherte Länder haben ein ungültiges Format.");
    }

    visitedCountries = parsedCountries;
  }
}

function saveDiscoveredArea(area) {
  const areaAlreadyExists = discoveredAreas.some(
    (savedArea) => calculateDistance(savedArea, area) < area.radius,
  );

  if (areaAlreadyExists) {
    return false;
  }

  discoveredAreas.push(area);
  localStorage.setItem(storageKey, JSON.stringify(discoveredAreas));
  drawDiscoveredArea(area);
  return true;
}

function addTravelledDistance(distance) {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("Die zurückgelegte Distanz ist ungültig.");
  }

  travelledDistance += distance;
  localStorage.setItem(distanceStorageKey, String(travelledDistance));
}

function addVisitedCountry(country) {
  if (typeof country !== "string" || !country.trim()) {
    throw new Error("Das besuchte Land ist ungültig.");
  }

  const normalizedCountry = country.trim();

  if (visitedCountries.includes(normalizedCountry)) {
    return false;
  }

  visitedCountries.push(normalizedCountry);
  visitedCountries.sort((firstCountry, secondCountry) =>
    firstCountry.localeCompare(secondCountry, "de"),
  );
  localStorage.setItem(countriesStorageKey, JSON.stringify(visitedCountries));
  return true;
}

function getStatistics() {
  const progressByCountry = new Map();

  discoveredAreas.forEach((area) => {
    if (!area.countryName || !area.countryArea) {
      return;
    }

    const countryKey = area.countryCode || area.countryName;
    const currentProgress = progressByCountry.get(countryKey) || {
      name: area.countryName,
      code: area.countryCode || countryKey,
      unlockedArea: 0,
      countryArea: area.countryArea,
    };
    currentProgress.unlockedArea += Math.PI * area.radius ** 2;
    progressByCountry.set(countryKey, currentProgress);
  });

  return {
    distance: travelledDistance,
    countries: [...visitedCountries],
    countryProgress: [...progressByCountry.values()].map((country) => ({
      ...country,
      percentage: Math.min(
        100,
        (country.unlockedArea / (country.countryArea * 1000000)) * 100,
      ),
    })),
  };
}

window.loadDiscoveredAreas = loadDiscoveredAreas;
window.saveDiscoveredArea = saveDiscoveredArea;
window.updateAreaCountry = updateAreaCountry;
window.getAreasWithoutCountry = getAreasWithoutCountry;
window.addTravelledDistance = addTravelledDistance;
window.addVisitedCountry = addVisitedCountry;
window.getStatistics = getStatistics;
