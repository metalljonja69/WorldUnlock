const storageKey = "worldUnlockedAreas";
const distanceStorageKey = "worldUnlockedDistance";
const countriesStorageKey = "worldUnlockedCountries";
const avatarStorageKey = "worldUnlockAvatar";
let discoveredAreas = [];
let travelledDistance = 0;
let visitedCountries = [];
let selectedAvatar = "normal";

const avatarDefinitions = [
  { id: "normal", label: "Anfänger", requiredDistance: 0, svg: '<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="#f3c7a6" d="M5 2h6v5H5z"/><path fill="#3155a4" d="M4 7h8v8H4z"/><path fill="#f3c7a6" d="M2 8h2v5H2zm10 0h2v5h-2z"/><path fill="#252b45" d="M5 15h2v5H5zm4 0h2v5H9z"/><path fill="#5b3526" d="M4 2h8v2H4z"/></svg>' },
  { id: "explorer", label: "Späher", requiredDistance: 10000, svg: '<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="#e9b995" d="M5 2h6v5H5z"/><path fill="#d97839" d="M4 7h8v8H4z"/><path fill="#e9b995" d="M2 8h2v5H2zm10 0h2v5h-2z"/><path fill="#252b45" d="M5 15h2v5H5zm4 0h2v5H9z"/><path fill="#3e2c22" d="M4 2h8v2H4z"/></svg>' },
  { id: "adventurer", label: "Abenteurer", requiredDistance: 25000, svg: '<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="#dba47e" d="M5 2h6v5H5z"/><path fill="#268f74" d="M4 7h8v8H4z"/><path fill="#dba47e" d="M2 8h2v5H2zm10 0h2v5h-2z"/><path fill="#252b45" d="M5 15h2v5H5zm4 0h2v5H9z"/><path fill="#d7dce5" d="m3 2 5-2 5 2-2 2H5z"/></svg>' },
  { id: "hero", label: "Held", requiredDistance: 50000, svg: '<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="#c98768" d="M5 2h6v5H5z"/><path fill="#7047a8" d="M4 7h8v8H4z"/><path fill="#c98768" d="M2 8h2v5H2zm12 0h2v5h-2z"/><path fill="#252b45" d="M5 15h2v5H5zm4 0h2v5H9z"/><path fill="#e6c34a" d="M4 2h8v2H4z"/></svg>' },
  { id: "legend", label: "Legende", requiredDistance: 100000, svg: '<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="#8f604f" d="M5 2h6v5H5z"/><path fill="#b53f5d" d="M4 7h8v8H4z"/><path fill="#8f604f" d="M2 8h2v5H2zm12 0h2v5h-2z"/><path fill="#252b45" d="M5 15h2v5H5zm4 0h2v5H9z"/><path fill="#e6c34a" d="M3 2h10v2H3z"/></svg>' },
];

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

function getUnlockedAvatars() {
  return avatarDefinitions.filter((avatar) => avatar.requiredDistance <= travelledDistance);
}

function getTotalDiscoveredArea() {
  return discoveredAreas.reduce((total, area) => total + getAreaSize(area), 0);
}

function getAvatarDefinitions() {
  return avatarDefinitions.map((avatar) => ({
    ...avatar,
    unlocked: avatar.requiredDistance <= travelledDistance,
  }));
}

function getSelectedAvatar() {
  const unlockedAvatars = getUnlockedAvatars();
  if (!unlockedAvatars.some((avatar) => avatar.id === selectedAvatar)) {
    selectedAvatar = "normal";
  }
  return unlockedAvatars.find((avatar) => avatar.id === selectedAvatar) || avatarDefinitions[0];
}

function setSelectedAvatar(avatarId) {
  if (!getUnlockedAvatars().some((avatar) => avatar.id === avatarId)) {
    throw new Error("Dieser Avatar ist noch nicht freigeschaltet.");
  }
  selectedAvatar = avatarId;
  localStorage.setItem(avatarStorageKey, selectedAvatar);
}

function getMunicipalityProgress() {
  const progressByMunicipality = new Map();
  discoveredAreas.forEach((area) => {
    if (!area.municipality) {
      return;
    }
    const current = progressByMunicipality.get(area.municipality) || {
      name: area.municipality,
      unlockedArea: 0,
    };
    current.unlockedArea += getAreaSize(area);
    progressByMunicipality.set(area.municipality, current);
  });
  return [...progressByMunicipality.values()].map((municipality) => ({
    ...municipality,
    percentage: Math.min(100, (municipality.unlockedArea / 1000000) * 100),
  }));
}

function drawDiscoveredArea(area) {
  window.addFogArea(area);
}

function isValidArea(area) {
  return (
    Number.isFinite(area.latitude) &&
    Number.isFinite(area.longitude) &&
    Number.isFinite(area.radius) &&
    area.radius > 0 &&
    (area.startLatitude === undefined ||
      (Number.isFinite(area.startLatitude) &&
        Number.isFinite(area.startLongitude))) &&
    (area.countryName === undefined || typeof area.countryName === "string") &&
    (area.countryCode === undefined || typeof area.countryCode === "string") &&
    (area.municipality === undefined ||
      (typeof area.municipality === "string" && area.municipality.trim())) &&
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
  if (country.municipality) {
    area.municipality = country.municipality;
  }
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

  const savedAvatar = localStorage.getItem(avatarStorageKey);
  if (savedAvatar && typeof savedAvatar === "string") {
    selectedAvatar = savedAvatar;
  }
}

function saveDiscoveredArea(area) {
  const duplicateArea = discoveredAreas.some(
    (savedArea) =>
      calculateDistance(savedArea, area) <= Math.max(savedArea.radius, area.radius),
  );
  if (duplicateArea) {
    return false;
  }
  discoveredAreas.push(area);
  localStorage.setItem(storageKey, JSON.stringify(discoveredAreas));
  drawDiscoveredArea(area);
  return true;
}

function clearStoredData() {
  localStorage.removeItem(storageKey);
  localStorage.removeItem(distanceStorageKey);
  localStorage.removeItem(countriesStorageKey);
  localStorage.removeItem(avatarStorageKey);
  if (window.explorationEngine) {
    window.explorationEngine.clear();
  }
  discoveredAreas = [];
  travelledDistance = 0;
  visitedCountries = [];
  selectedAvatar = "normal";
  window.clearDiscoveredAreas();
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

function getAreaSize(area) {
  if (Number.isFinite(area.startLatitude)) {
    return (
      calculateDistance(
        {
          latitude: area.startLatitude,
          longitude: area.startLongitude,
        },
        area,
      ) *
        area.radius *
        2 +
      Math.PI * area.radius ** 2
    );
  }

  return Math.PI * area.radius ** 2;
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
    currentProgress.unlockedArea += getAreaSize(area);
    progressByCountry.set(countryKey, currentProgress);
  });

  return {
    distance: travelledDistance,
    areaCount: discoveredAreas.length,
    countryCount: visitedCountries.length,
    exploration: window.explorationEngine
      ? window.explorationEngine.getProgress()
      : {
          xp: 0,
          level: 1,
          cellCount: 0,
          currentLevelXp: 0,
          nextLevelXp: 100,
          percentage: 0,
        },
    countries: [...visitedCountries],
    countryProgress: [...progressByCountry.values()].map((country) => ({
      ...country,
      percentage: Math.min(
        100,
        (country.unlockedArea / (country.countryArea * 1000000)) * 100,
      ),
    })),
    municipalities: getMunicipalityProgress(),
    totalArea: getTotalDiscoveredArea(),
  };
}

window.loadDiscoveredAreas = loadDiscoveredAreas;
window.saveDiscoveredArea = saveDiscoveredArea;
window.clearStoredData = clearStoredData;
window.updateAreaCountry = updateAreaCountry;
window.getAreasWithoutCountry = getAreasWithoutCountry;
window.addTravelledDistance = addTravelledDistance;
window.addVisitedCountry = addVisitedCountry;
window.getStatistics = getStatistics;
window.getAvatarDefinitions = getAvatarDefinitions;
window.getSelectedAvatar = getSelectedAvatar;
window.setSelectedAvatar = setSelectedAvatar;
