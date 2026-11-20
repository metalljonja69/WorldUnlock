const storageKey = "worldUnlockedAreas";
const distanceStorageKey = "worldUnlockedDistance";
const countriesStorageKey = "worldUnlockedCountries";
const avatarStorageKey = "worldUnlockAvatar";
// Neuer Schlüssel: Der alte Cache konnte falsche Gemeinden enthalten.
const municipalityCacheStorageKey = "worldUnlockMunicipalityBoundaries";
const legacyMunicipalityCacheStorageKey = "worldUnlockMunicipalityCache";
let discoveredAreas = [];
let travelledDistance = 0;
let visitedCountries = [];
let selectedAvatar = "normal";
const coverageGridSize = 25;
const coverageSampleStep = 12;
const metersPerDegreeLatitude = 111320;
const discoveredCoverageCells = new Set();
// Abgedeckte Rasterzellen pro Land, damit Überlappungen nicht doppelt zählen.
const coverageCellsByCountry = new Map();
// Gemeindegrenzen werden nur hier gespeichert, nicht in jedem Gebiet.
const municipalityCache = new Map();
let municipalityCacheLoaded = false;

const latitudeStep = coverageGridSize / metersPerDegreeLatitude;

function longitudeStepForLatitudeIndex(latitudeIndex) {
  const latitude = (latitudeIndex + 0.5) * latitudeStep;
  return coverageGridSize /
    (metersPerDegreeLatitude * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));
}

// Festes Raster: Die Zellbreite hängt nur von der Zeile ab, nicht vom Punkt.
function coverageCellKey(latitude, longitude) {
  const latitudeIndex = Math.floor(latitude / latitudeStep);
  const longitudeIndex = Math.floor(longitude / longitudeStepForLatitudeIndex(latitudeIndex));
  return `${latitudeIndex}:${longitudeIndex}`;
}

function coverageCellCenter(key) {
  const [latitudeIndex, longitudeIndex] = key.split(":").map(Number);
  return {
    latitude: (latitudeIndex + 0.5) * latitudeStep,
    longitude: (longitudeIndex + 0.5) * longitudeStepForLatitudeIndex(latitudeIndex),
  };
}

function forEachCoverageCircleCell(center, radius, callback) {
  for (let latitudeOffset = -radius; latitudeOffset <= radius; latitudeOffset += coverageSampleStep) {
    const latitude = center.latitude + latitudeOffset / metersPerDegreeLatitude;
    const metersPerDegreeLongitude =
      metersPerDegreeLatitude * Math.max(0.1, Math.cos((latitude * Math.PI) / 180));
    for (let longitudeOffset = -radius; longitudeOffset <= radius; longitudeOffset += coverageSampleStep) {
      if (latitudeOffset ** 2 + longitudeOffset ** 2 > radius ** 2) continue;
      callback(coverageCellKey(latitude, center.longitude + longitudeOffset / metersPerDegreeLongitude));
    }
  }
}

function forEachCoverageCell(area, callback) {
  if (Number.isFinite(area.startLatitude) && Number.isFinite(area.startLongitude)) {
    const start = { latitude: area.startLatitude, longitude: area.startLongitude };
    const end = { latitude: area.latitude, longitude: area.longitude };
    const steps = Math.max(1, Math.ceil(calculateDistance(start, end) / 10));
    for (let step = 0; step <= steps; step += 1) {
      const fraction = step / steps;
      forEachCoverageCircleCell({
        latitude: start.latitude + (end.latitude - start.latitude) * fraction,
        longitude: start.longitude + (end.longitude - start.longitude) * fraction,
      }, area.radius, callback);
    }
    return;
  }
  forEachCoverageCircleCell(area, area.radius, callback);
}

function getCountryCells(countryCode) {
  if (!coverageCellsByCountry.has(countryCode)) {
    coverageCellsByCountry.set(countryCode, new Set());
  }
  return coverageCellsByCountry.get(countryCode);
}

function registerCoverageArea(area) {
  const countryCells = area.countryCode ? getCountryCells(area.countryCode) : null;
  forEachCoverageCell(area, (key) => {
    discoveredCoverageCells.add(key);
    if (countryCells) countryCells.add(key);
  });
}

function findNewCoverageCells(area) {
  const newCells = new Set();
  forEachCoverageCell(area, (key) => {
    if (!discoveredCoverageCells.has(key)) newCells.add(key);
  });
  return newCells;
}

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

function municipalityCacheKey(name) {
  return name.trim().toLocaleLowerCase("de");
}

function loadMunicipalityCache() {
  if (municipalityCacheLoaded) return;
  municipalityCacheLoaded = true;
  localStorage.removeItem(legacyMunicipalityCacheStorageKey);
  const savedCache = localStorage.getItem(municipalityCacheStorageKey);
  if (!savedCache) return;
  try {
    const parsedCache = JSON.parse(savedCache);
    Object.entries(parsedCache || {}).forEach(([key, value]) => {
      if (value?.polygon?.rings?.length) municipalityCache.set(key, value);
    });
  } catch (error) {
    console.warn("Gemeindegrenzen-Cache ist ungültig.", error);
  }
}

function saveMunicipalityCache() {
  const cacheObject = {};
  municipalityCache.forEach((value, key) => {
    if (value?.polygon) cacheObject[key] = value;
  });
  try {
    localStorage.setItem(municipalityCacheStorageKey, JSON.stringify(cacheObject));
  } catch (error) {
    console.warn("Gemeindegrenzen konnten nicht gespeichert werden.", error);
  }
}

function getCachedMunicipality(name) {
  if (!name) return null;
  loadMunicipalityCache();
  return municipalityCache.get(municipalityCacheKey(name)) || null;
}

function getRingsBounds(rings) {
  let minLatitude = Infinity;
  let maxLatitude = -Infinity;
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;
  rings.forEach((ring) => ring.forEach(([longitude, latitude]) => {
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
  }));
  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

function getMunicipalityProgress() {
  const names = new Map();
  discoveredAreas.forEach((area) => {
    if (area.municipality && !names.has(municipalityCacheKey(area.municipality))) {
      names.set(municipalityCacheKey(area.municipality), area.municipality);
    }
  });
  return [...names.values()].map((name) => {
    const municipality = getCachedMunicipality(name);
    const coveredArea = municipality?.polygon
      ? calculateMunicipalityCoverage(municipality.polygon)
      : 0;
    return {
      name,
      unlockedArea: coveredArea,
      municipalityArea: municipality?.area,
      percentage: municipality?.area > 0
        ? Math.min(100, (coveredArea / municipality.area) * 100)
        : 0,
    };
  });
}

function pointInPolygon(latitude, longitude, rings) {
  const insideRing = (ring) => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const currentPoint = ring[index];
      const previousPoint = ring[previous];
      const intersects =
        (currentPoint[1] > latitude) !== (previousPoint[1] > latitude) &&
        longitude <
          ((previousPoint[0] - currentPoint[0]) *
            (latitude - currentPoint[1]) /
            (previousPoint[1] - currentPoint[1]) +
            currentPoint[0]);
      if (intersects) inside = !inside;
    }
    return inside;
  };
  if (!rings?.length) return false;
  // ESRI-Polygone: Ringe im Uhrzeigersinn sind Aussenringe, sonst Löcher.
  // Ein Punkt zählt, wenn er in einer ungeraden Anzahl Ringe liegt.
  return rings.filter(insideRing).length % 2 === 1;
}

function calculateMunicipalityCoverage(polygon) {
  const rings = polygon.rings || [];
  if (!rings.length) return 0;
  const bounds = getRingsBounds(rings);
  let count = 0;
  for (const key of discoveredCoverageCells) {
    const center = coverageCellCenter(key);
    if (
      center.latitude < bounds.minLatitude || center.latitude > bounds.maxLatitude ||
      center.longitude < bounds.minLongitude || center.longitude > bounds.maxLongitude
    ) {
      continue;
    }
    if (pointInPolygon(center.latitude, center.longitude, rings)) {
      count += 1;
    }
  }
  return count * coverageGridSize * coverageGridSize;
}

function drawDiscoveredArea(area) {
  window.addFogArea(area);
}

function isValidArea(area) {
  return (
    area !== null &&
    typeof area === "object" &&
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

function persistAreas() {
  localStorage.setItem(storageKey, JSON.stringify(discoveredAreas));
}

// Ordnet einem gespeicherten Gebiet Land und Gemeinde zu.
// `area` ist das Objekt, das saveDiscoveredArea zurückgegeben hat.
function updateAreaCountry(area, place) {
  const target = discoveredAreas.includes(area)
    ? area
    : discoveredAreas.find(
      (savedArea) =>
        savedArea.latitude === area.latitude && savedArea.longitude === area.longitude,
    );

  if (!target) {
    return false;
  }

  target.countryName = place.name;
  target.countryCode = place.code;
  target.countryArea = place.area;
  if (place.municipality) {
    target.municipality = place.municipality;
  }
  const countryCells = getCountryCells(target.countryCode);
  forEachCoverageCell(target, (key) => countryCells.add(key));
  persistAreas();
  return true;
}

function getAreasWithoutCountry() {
  return discoveredAreas.filter((area) => !area.countryName);
}

function getMunicipalitiesWithoutBoundary() {
  loadMunicipalityCache();
  const missing = new Map();
  discoveredAreas.forEach((area) => {
    if (
      area.municipality &&
      (!area.countryCode || area.countryCode === "CH") &&
      !municipalityCache.has(municipalityCacheKey(area.municipality))
    ) {
      missing.set(municipalityCacheKey(area.municipality), area.municipality);
    }
  });
  return [...missing.values()];
}

function addMunicipalityBoundary(municipalityName, boundary) {
  if (!boundary?.polygon) return;
  loadMunicipalityCache();
  municipalityCache.set(municipalityCacheKey(municipalityName), boundary);
  saveMunicipalityCache();
}

function loadDiscoveredAreas() {
  loadMunicipalityCache();
  const savedAreas = localStorage.getItem(storageKey);

  if (savedAreas) {
    const parsedAreas = JSON.parse(savedAreas);

    if (!Array.isArray(parsedAreas) || !parsedAreas.every(isValidArea)) {
      throw new Error("Gespeicherte Gebiete haben ein ungültiges Format.");
    }

    // Alte Versionen speicherten die Gemeindegrenze in jedem Gebiet.
    // Das füllt den Speicher und konnte falsch sein: entfernen, die
    // Grenzen werden einmal pro Gemeinde neu geladen.
    let migrated = false;
    parsedAreas.forEach((area) => {
      if ("municipalityPolygon" in area || "municipalityArea" in area) {
        delete area.municipalityPolygon;
        delete area.municipalityArea;
        migrated = true;
      }
    });

    discoveredAreas = parsedAreas;
    discoveredAreas.forEach((area) => {
      registerCoverageArea(area);
      drawDiscoveredArea(area);
    });

    if (migrated) {
      persistAreas();
    }
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

// Speichert ein Gebiet, wenn es neue Fläche aufdeckt.
// Gibt das gespeicherte Gebiet zurück, sonst null.
function saveDiscoveredArea(area) {
  const newCells = findNewCoverageCells(area);
  if (!newCells.size) {
    return null;
  }
  discoveredAreas.push(area);
  try {
    persistAreas();
  } catch (error) {
    discoveredAreas.pop();
    throw error;
  }
  newCells.forEach((key) => discoveredCoverageCells.add(key));
  drawDiscoveredArea(area);
  return area;
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
  discoveredCoverageCells.clear();
  coverageCellsByCountry.clear();
  window.clearDiscoveredAreas();
}

// Grenzen gibt es nur für Schweizer Gemeinden (swisstopo).
async function lookupMunicipalityBoundary(municipalityName, countryCode) {
  if (!municipalityName) return null;
  if (countryCode && countryCode !== "CH") return null;
  loadMunicipalityCache();
  const cacheKey = municipalityCacheKey(municipalityName);
  if (municipalityCache.has(cacheKey)) return municipalityCache.get(cacheKey);

  const url =
    "https://api3.geo.admin.ch/rest/services/api/MapServer/find?" +
    new URLSearchParams({
      searchText: municipalityName,
      searchField: "gemname",
      contains: "false",
      sr: "4326",
      layer: "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
    });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gemeindegrenze konnte nicht geladen werden: ${response.status}`);
  const data = await response.json();
  const matches = (data.results || []).filter((candidate) =>
    typeof candidate.attributes?.gemname === "string" &&
    municipalityCacheKey(candidate.attributes.gemname) === cacheKey &&
    candidate.geometry?.rings?.length,
  );
  // swisstopo liefert jeden Jahrgang seit 1850. Nur den aktuellen Stand
  // verwenden, sonst stimmen Grenze und Fläche nicht (z. B. Zürich 1850).
  const feature =
    matches.find((candidate) => candidate.attributes.is_current_jahr === true) ||
    matches.sort((first, second) => (second.attributes.jahr || 0) - (first.attributes.jahr || 0))[0];
  if (!feature) {
    // Nicht erneut nachfragen, solange die App läuft.
    municipalityCache.set(cacheKey, null);
    return null;
  }

  const municipality = {
    name: municipalityName,
    polygon: { rings: feature.geometry.rings },
    area:
      Number.isFinite(feature.attributes?.gemflaeche)
        ? feature.attributes.gemflaeche * 10000
        : null,
  };
  municipalityCache.set(cacheKey, municipality);
  saveMunicipalityCache();
  return municipality;
}

function exportStoredData() {
  const backup = {
    format: "worldunlock-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    values: {},
  };
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("worldUnlock") || key?.startsWith("worldUnlocked")) {
      backup.values[key] = localStorage.getItem(key);
    }
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `worldunlock-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importStoredData(file) {
  const backup = JSON.parse(await file.text());
  if (backup.format !== "worldunlock-backup" || !backup.values ||
      typeof backup.values !== "object") {
    throw new Error("Dies ist keine gültige WorldUnlock-Sicherungsdatei.");
  }
  for (const [key, value] of Object.entries(backup.values)) {
    if (
      (key.startsWith("worldUnlock") || key.startsWith("worldUnlocked")) &&
      typeof value === "string"
    ) {
      localStorage.setItem(key, value);
    }
  }
  window.location.reload();
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
  const countryInfo = new Map();
  discoveredAreas.forEach((area) => {
    if (!area.countryCode || !area.countryArea || countryInfo.has(area.countryCode)) {
      return;
    }
    countryInfo.set(area.countryCode, {
      name: area.countryName,
      code: area.countryCode,
      countryArea: area.countryArea,
    });
  });

  const cellArea = coverageGridSize * coverageGridSize;

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
    countryProgress: [...countryInfo.values()].map((country) => {
      const unlockedArea = (coverageCellsByCountry.get(country.code)?.size || 0) * cellArea;
      return {
        ...country,
        unlockedArea,
        percentage: Math.min(100, (unlockedArea / (country.countryArea * 1000000)) * 100),
      };
    }),
    municipalities: getMunicipalityProgress(),
    totalArea: discoveredCoverageCells.size * cellArea,
  };
}

window.loadDiscoveredAreas = loadDiscoveredAreas;
window.saveDiscoveredArea = saveDiscoveredArea;
window.clearStoredData = clearStoredData;
window.updateAreaCountry = updateAreaCountry;
window.getAreasWithoutCountry = getAreasWithoutCountry;
window.getMunicipalitiesWithoutBoundary = getMunicipalitiesWithoutBoundary;
window.addMunicipalityBoundary = addMunicipalityBoundary;
window.addTravelledDistance = addTravelledDistance;
window.addVisitedCountry = addVisitedCountry;
window.getStatistics = getStatistics;
window.getAvatarDefinitions = getAvatarDefinitions;
window.getSelectedAvatar = getSelectedAvatar;
window.setSelectedAvatar = setSelectedAvatar;
window.lookupMunicipalityBoundary = lookupMunicipalityBoundary;
window.exportStoredData = exportStoredData;
window.importStoredData = importStoredData;
