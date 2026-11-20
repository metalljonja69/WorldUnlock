(function (global) {
  "use strict";

  const countryAreaStorageKey = "worldUnlockCountryAreas";
  // ~1 km Raster: Punkte in derselben Zelle teilen sich eine Abfrage.
  const placeGridSize = 0.01;
  const placeCache = new Map();
  const pendingLookups = new Map();
  let countryAreas = null;

  function loadCountryAreas() {
    if (countryAreas) return countryAreas;
    countryAreas = {};
    try {
      const saved = JSON.parse(localStorage.getItem(countryAreaStorageKey) || "{}");
      Object.entries(saved).forEach(([code, area]) => {
        if (Number.isFinite(area) && area > 0) countryAreas[code] = area;
      });
    } catch (error) {
      console.warn("Gespeicherte Länderflächen sind ungültig.", error);
    }
    return countryAreas;
  }

  async function lookupCountryArea(countryCode) {
    const areas = loadCountryAreas();
    if (areas[countryCode]) return areas[countryCode];

    const response = await fetch(
      `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/AG.LND.TOTL.K2?format=json&mrnev=1`,
    );
    if (!response.ok) {
      throw new Error(`Länderfläche konnte nicht geladen werden: ${response.status}`);
    }
    const data = await response.json();
    const area = data?.[1]?.[0]?.value;
    if (!Number.isFinite(area) || area <= 0) {
      throw new Error("Länderfläche hat ein ungültiges Format.");
    }
    areas[countryCode] = area;
    try {
      localStorage.setItem(countryAreaStorageKey, JSON.stringify(areas));
    } catch (error) {
      console.warn("Länderfläche konnte nicht gespeichert werden.", error);
    }
    return area;
  }

  // Gemeinde = Verwaltungsebene 8 (in der Schweiz die politische Gemeinde),
  // nicht `locality`, das oft nur ein Quartier ist.
  function getMunicipalityName(place) {
    const administrative = place.localityInfo?.administrative || [];
    const municipality = administrative.find((entry) => entry.adminLevel === 8)?.name;
    return municipality || place.city || place.locality || null;
  }

  async function fetchPlace(position) {
    const response = await fetch(
      "https://api.bigdatacloud.net/data/reverse-geocode-client?" +
      new URLSearchParams({
        latitude: position.latitude.toFixed(5),
        longitude: position.longitude.toFixed(5),
        localityLanguage: "de",
      }),
    );
    if (!response.ok) {
      throw new Error(`Reverse-Geocoding fehlgeschlagen: ${response.status}`);
    }
    const place = await response.json();
    if (!place.countryName || !place.countryCode) {
      throw new Error("Reverse-Geocoding lieferte kein Land.");
    }
    return {
      name: place.countryName,
      code: place.countryCode,
      area: await lookupCountryArea(place.countryCode),
      municipality: getMunicipalityName(place),
    };
  }

  function cacheKey(position) {
    return `${Math.round(position.latitude / placeGridSize)}:${Math.round(position.longitude / placeGridSize)}`;
  }

  function lookupPlace(position) {
    const key = cacheKey(position);
    if (placeCache.has(key)) return Promise.resolve(placeCache.get(key));
    if (pendingLookups.has(key)) return pendingLookups.get(key);

    const lookup = fetchPlace(position)
      .then((place) => {
        placeCache.set(key, place);
        return place;
      })
      .finally(() => pendingLookups.delete(key));
    pendingLookups.set(key, lookup);
    return lookup;
  }

  global.placeService = Object.freeze({ lookupPlace });
})(window);
