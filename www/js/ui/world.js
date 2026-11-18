(function (global) {
  "use strict";

  function formatArea(totalArea) {
    return totalArea > 0
      ? `${(totalArea / 1000000).toFixed(2)} km²`
      : "Noch keine Daten";
  }

  function addProgressRow(container, name, percentage) {
    const item = document.createElement("div");
    item.className = "world-country-item";
    const heading = document.createElement("div");
    heading.className = "world-country-heading";
    const label = document.createElement("span");
    label.textContent = name;
    const value = document.createElement("span");
    value.textContent = `${percentage.toFixed(2)} %`;
    heading.append(label, value);
    const track = document.createElement("div");
    track.className = "progress-track";
    const bar = document.createElement("span");
    bar.style.width = `${percentage}%`;
    track.append(bar);
    item.append(heading, track);
    container.append(item);
  }

  function render(event) {
    const statistics = event.detail;
    document.querySelector("#world-discovered-area").textContent =
      formatArea(statistics.totalArea);
    document.querySelector("#world-discovered-count").textContent =
      `${statistics.areaCount} Gebiete entdeckt`;
    document.querySelector("#countries-empty").hidden = statistics.countries.length > 0;

    const countryList = document.querySelector("#world-country-list");
    countryList.replaceChildren();
    statistics.countryProgress.forEach((country) => {
      addProgressRow(countryList, country.name, country.percentage);
    });

    const municipalityList = document.querySelector("#municipality-list");
    municipalityList.replaceChildren();
    statistics.municipalities.forEach((municipality) => {
      addProgressRow(municipalityList, municipality.name, municipality.percentage);
    });
  }

  global.WorldUnlockWorld = Object.freeze({ render });
  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
