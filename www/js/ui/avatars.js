(function (global) {
  "use strict";

  function formatDistance(distance) {
    return distance >= 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`;
  }

  function render(event) {
    const statistics = event.detail;
    const definitions = global.getAvatarDefinitions();
    const selected = global.getSelectedAvatar();

    document.querySelector("#dashboard-avatar").innerHTML = selected.svg;
    document.querySelector("#dashboard-avatar-name").textContent = selected.label;
    document.querySelector("#profile-avatar").innerHTML = selected.svg;

    const grid = document.querySelector("#avatar-grid");
    grid.replaceChildren(...definitions.map((avatar) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "avatar-choice";
      button.disabled = !avatar.unlocked;
      button.dataset.avatarId = avatar.id;
      button.setAttribute(
        "aria-label",
        avatar.unlocked ? avatar.label : `${avatar.label}, gesperrt`,
      );
      button.setAttribute("aria-pressed", String(avatar.id === selected.id));
      const icon = document.createElement("span");
      icon.innerHTML = avatar.svg;
      const label = document.createElement("span");
      label.textContent = avatar.label;
      const condition = document.createElement("small");
      condition.className = "avatar-condition";
      condition.textContent = avatar.unlocked
        ? "Verfügbar"
        : `${formatDistance(avatar.requiredDistance)} freischalten`;
      button.append(icon, label, condition);
      return button;
    }));

    const remaining = definitions
      .filter((avatar) => !avatar.unlocked)
      .map((avatar) => `${avatar.label}: ${formatDistance(
        Math.max(0, avatar.requiredDistance - statistics.distance),
      )}`)
      .join(" · ");
    document.querySelector("#avatar-progress").textContent =
      remaining || "Alle Avatare freigeschaltet.";
  }

  document.querySelector("#avatar-grid").addEventListener("click", (event) => {
    const button = event.target.closest(".avatar-choice");
    if (!button || button.disabled) return;
    try {
      global.setSelectedAvatar(button.dataset.avatarId);
      document.dispatchEvent(new CustomEvent("worldunlock:statistics-updated", {
        detail: global.getStatistics(),
      }));
      document.dispatchEvent(new CustomEvent("worldunlock:avatar-selected", {
        detail: global.getSelectedAvatar(),
      }));
    } catch (error) {
      console.error(error);
    }
  });

  global.WorldUnlockAvatars = Object.freeze({ render });
  document.addEventListener("worldunlock:statistics-updated", render);
})(window);
