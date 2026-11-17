const explorationCellStorageKey = "worldUnlockExplorationCells";
const explorationXpStorageKey = "worldUnlockExplorationXp";
const explorationCellSize = 0.0005;
const explorationXpPerCell = 25;

let discoveredCells = new Set();
let explorationXp = 0;

function getCellCoordinates(latitude, longitude) {
  const scaledCellSize = Math.round(explorationCellSize * 1000000);
  return {
    latitude: Math.floor(
      Math.round((latitude + 90) * 1000000) / scaledCellSize,
    ),
    longitude: Math.floor(
      Math.round((longitude + 180) * 1000000) / scaledCellSize,
    ),
  };
}

function getCellId(latitude, longitude) {
  const cell = getCellCoordinates(latitude, longitude);
  return `${cell.latitude}:${cell.longitude}`;
}

function getNearbyCellIds(latitude, longitude, distance = 1) {
  const center = getCellCoordinates(latitude, longitude);
  const cellIds = [];

  for (let latitudeOffset = -distance; latitudeOffset <= distance; latitudeOffset += 1) {
    for (let longitudeOffset = -distance; longitudeOffset <= distance; longitudeOffset += 1) {
      cellIds.push(
        `${center.latitude + latitudeOffset}:${center.longitude + longitudeOffset}`,
      );
    }
  }

  return cellIds;
}

function getLevelForXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function getNextLevelXp(level) {
  return level ** 2 * 100;
}

function loadExplorationProgress() {
  const savedCells = localStorage.getItem(explorationCellStorageKey);
  const savedXp = localStorage.getItem(explorationXpStorageKey);

  if (savedCells) {
    const parsedCells = JSON.parse(savedCells);
    if (!Array.isArray(parsedCells) || !parsedCells.every((cell) => typeof cell === "string")) {
      throw new Error("Gespeicherte Rasterzellen haben ein ungültiges Format.");
    }
    discoveredCells = new Set(parsedCells);
  }

  if (savedXp) {
    const parsedXp = Number(savedXp);
    if (!Number.isFinite(parsedXp) || parsedXp < 0) {
      throw new Error("Gespeicherte XP haben ein ungültiges Format.");
    }
    explorationXp = parsedXp;
  }
}

function processExplorationLocation(location) {
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    !Number.isFinite(location.accuracy) ||
    location.accuracy > 100
  ) {
    return { status: "invalid", cellId: null, xpAwarded: 0 };
  }

  const cellId = getCellId(location.latitude, location.longitude);
  if (discoveredCells.has(cellId)) {
    return { status: "known", cellId, xpAwarded: 0 };
  }

  discoveredCells.add(cellId);
  explorationXp += explorationXpPerCell;
  localStorage.setItem(
    explorationCellStorageKey,
    JSON.stringify([...discoveredCells]),
  );
  localStorage.setItem(explorationXpStorageKey, String(explorationXp));

  return {
    status: "new",
    cellId,
    xpAwarded: explorationXpPerCell,
  };
}

function getExplorationProgress() {
  const level = getLevelForXp(explorationXp);
  const currentLevelXp = (level - 1) ** 2 * 100;
  const nextLevelXp = getNextLevelXp(level);

  return {
    xp: explorationXp,
    level,
    cellCount: discoveredCells.size,
    currentLevelXp,
    nextLevelXp,
    percentage: Math.min(
      100,
      ((explorationXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100,
    ),
  };
}

function clearExplorationProgress() {
  localStorage.removeItem(explorationCellStorageKey);
  localStorage.removeItem(explorationXpStorageKey);
  discoveredCells = new Set();
  explorationXp = 0;
}

window.explorationEngine = {
  load: loadExplorationProgress,
  getCellId,
  getNearbyCellIds,
  processLocation: processExplorationLocation,
  getProgress: getExplorationProgress,
  clear: clearExplorationProgress,
};
