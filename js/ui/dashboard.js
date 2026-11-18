(function (global) {
  "use strict";

  const byId = (id) => document.querySelector(`#${id}`);

  function formatArea(totalArea) {
    return totalArea > 0
      ? `${(totalArea / 1000000).toFixed(2)} km²`
      : "Noch keine Daten";
  }

  function formatDistance(distance) {
    return distance >= 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`;
  }

  function render(event) {
    const statistics = event.detail;
    byId("dashboard-area").textContent = formatArea(statistics.totalArea);
    byId("dashboard-countries").textContent = String(statistics.countryCount);
    byId("dashboard-discoveries").textContent = String(statistics.areaCount);
    byId("dashboard-xp").textContent = `${statistics.exploration.xp} XP`;
  }

  global.WorldUnlockDashboard = Object.freeze({
    render,
  });

  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
