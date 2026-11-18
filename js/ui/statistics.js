(function (global) {
  "use strict";

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
    document.querySelector("#statistics-distance").textContent =
      formatDistance(statistics.distance);
    document.querySelector("#statistics-area").textContent =
      formatArea(statistics.totalArea);
    document.querySelector("#statistics-countries").textContent =
      String(statistics.countryCount);
    document.querySelector("#statistics-xp").textContent =
      `${statistics.exploration.xp} XP`;
  }

  global.WorldUnlockStatistics = Object.freeze({ render });
  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
