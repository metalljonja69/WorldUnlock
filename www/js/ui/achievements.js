(function (global) {
  "use strict";

  function render(event) {
    const statistics = event.detail;
    const municipalities = statistics.municipalities;
    const municipalityComplete = municipalities.some((municipality) => municipality.percentage >= 100);
    const achievements = [
      {
        icon: "●",
        name: "Erste Entdeckung",
        description: "Entdecke dein erstes Gebiet.",
        condition: "Mindestens 1 Gebiet entdeckt",
        unlocked: statistics.areaCount >= 1,
      },
      {
        icon: "◆",
        name: "Erkundungspfad",
        description: "Entdecke fünf neue Gebiete.",
        condition: "Mindestens 5 Gebiete entdeckt",
        unlocked: statistics.areaCount >= 5,
      },
      {
        icon: "◎",
        name: "Neue Grenze",
        description: "Besuche dein erstes Land.",
        condition: "Mindestens 1 Land besucht",
        unlocked: statistics.countryCount >= 1,
      },
      {
        icon: "★",
        name: "Gemeinde vollständig erkundet",
        description: "Erfasse eine Gemeinde vollständig.",
        condition: "100 % einer Gemeinde erfasst",
        unlocked: municipalityComplete,
      },
    ];

    const unlocked = achievements.filter((achievement) => achievement.unlocked);
    document.querySelector("#achievement-status").textContent =
      `${unlocked.length} freigeschaltet`;

    document.querySelector("#achievement-list").replaceChildren(
      ...achievements.map((achievement) => {
        const item = document.createElement("article");
        item.className = `achievement-card ${achievement.unlocked ? "is-unlocked" : "is-locked"}`;
        const badge = document.createElement("span");
        badge.className = "achievement-badge";
        badge.textContent = achievement.icon;
        badge.setAttribute("aria-hidden", "true");
        const details = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = achievement.name;
        const description = document.createElement("small");
        description.textContent = `${achievement.description} ${achievement.condition}.`;
        details.append(name, description);
        const state = document.createElement("div");
        state.className = "achievement-state";
        state.textContent = achievement.unlocked ? "Freigeschaltet" : "Gesperrt";
        item.append(badge, details, state);
        return item;
      }),
    );

    const preview = unlocked.length
      ? unlocked.slice(-3).reverse().map((achievement) => {
          const item = document.createElement("div");
          item.className = "achievement-preview-item";
          const icon = document.createElement("span");
          icon.className = "achievement-icon";
          icon.textContent = achievement.icon;
          icon.setAttribute("aria-hidden", "true");
          const details = document.createElement("div");
          const name = document.createElement("strong");
          name.textContent = achievement.name;
          const description = document.createElement("small");
          description.textContent = achievement.description;
          details.append(name, description);
          item.append(icon, details);
          return item;
        })
      : [Object.assign(document.createElement("p"), {
          className: "empty-state",
          textContent: "Noch keine Erfolge freigeschaltet.",
        })];

    document.querySelector("#achievement-preview").replaceChildren(...preview);
    document.querySelector("#profile-achievements").replaceChildren(
      ...preview.map((element) => element.cloneNode(true)),
    );
  }

  global.WorldUnlockAchievements = Object.freeze({ render });
  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
