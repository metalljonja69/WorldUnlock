(function (global) {
  "use strict";

  const storageKey = "worldUnlockPlayerName";
  const nameInput = document.querySelector("#player-name-input");
  const headerName = document.querySelector("#player-name");

  function formatDistance(distance) {
    return distance >= 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`;
  }

  function formatArea(totalArea) {
    return totalArea > 0
      ? `${(totalArea / 1000000).toFixed(2)} km²`
      : "Noch keine Daten";
  }

  function render(event) {
    const statistics = event.detail;
    document.querySelector("#profile-level").textContent =
      String(statistics.exploration.level);
    document.querySelector("#profile-next-xp").textContent =
      `${statistics.exploration.nextLevelXp} XP`;
    document.querySelector("#profile-xp").textContent =
      String(statistics.exploration.xp);
    document.querySelector("#profile-progress-bar").style.width =
      `${statistics.exploration.percentage}%`;
    document.querySelector("#profile-distance").textContent =
      formatDistance(statistics.distance);
    document.querySelector("#profile-area").textContent =
      formatArea(statistics.totalArea);
    document.querySelector("#profile-countries").textContent =
      String(statistics.countryCount);
    document.querySelector("#profile-discoveries").textContent =
      String(statistics.areaCount);
  }

  const savedName = localStorage.getItem(storageKey)?.trim();
  if (savedName) {
    nameInput.value = savedName;
    headerName.textContent = savedName;
  }

  nameInput.addEventListener("change", () => {
    const name = nameInput.value.trim();
    if (name) {
      localStorage.setItem(storageKey, name);
      headerName.textContent = name;
    } else {
      localStorage.removeItem(storageKey);
      headerName.textContent = "Noch kein Name";
    }
  });

  global.WorldUnlockProfile = Object.freeze({ render });
  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
